import { PersistedFlow } from "./persisted-flow";
import { createFlowNodes } from "./flow";
import { SharedStorage } from "./utils/storage";
import type { KVStore } from "./persisted-flow";
import { ModelSet } from "./utils/llm";

/**
 * Flow Manager - handles flow lifecycle with memory optimization
 *
 * Core principles:
 * 1. Flow objects are created on-demand and released after execution
 * 2. Execution continues until reaching a callToAction (user interaction point)
 * 3. Any API call can trigger flow resumption
 */
export class FlowManager {
  private static activeFlows = new Map<string, PersistedFlow<SharedStorage>>();

  /**
   * Trigger flow execution in background (async)
   * This is the core "step to next call to action" logic
   */
  static async triggerFlow(
    kv: KVStore,
    models: ModelSet,
    runId: string
  ): Promise<void> {
    console.log(`[FlowManager] triggerFlow called for runId: ${runId}`);
    console.log(
      `[FlowManager] Active flows in memory: ${this.activeFlows.size}`
    );

    // Check if flow is already running in memory
    if (this.activeFlows.has(runId)) {
      console.log(
        `[FlowManager] Flow ${runId} is already running in memory, skipping execution`
      );
      return;
    }

    try {
      console.log(`[FlowManager] Attempting to get or attach flow ${runId}`);
      const flow = await this.getOrAttachFlow(kv, models, runId);
      console.log({ flow });
      if (!flow) {
        console.log(`[FlowManager] Failed to get or attach flow ${runId}`);
        return;
      }

      console.log(
        `[FlowManager] Successfully attached flow ${runId}, checking current state`
      );

      // First check if flow is already waiting for user input
      let shared = await flow.getShared();

      if (shared?.callToAction) {
        console.log(
          `[FlowManager] Flow ${runId} already paused at callToAction: ${shared.callToAction}`
        );
        return; // Don't execute anything, just return
      }

      console.log(`[FlowManager] Starting flow execution for ${runId}`);

      // Keep stepping until we hit a callToAction or flow completes
      while (await flow.step()) {
        shared = await flow.getShared();

        // Check if we've hit a user interaction point after this step
        if (shared?.callToAction) {
          console.log(
            `[FlowManager] Flow ${runId} paused at callToAction: ${shared.callToAction}`
          );
          break;
        }
      }

      if (!shared?.callToAction) {
        console.log(`[FlowManager] Flow ${runId} completed execution`);
      }
    } catch (error) {
      console.error(`[FlowManager] Flow ${runId} execution error:`, error);
    } finally {
      // Always release memory object
      this.activeFlows.delete(runId);
    }
  }

  /**
   * Handle user input and resume flow execution
   */
  static async handleUserInput(
    kv: KVStore,
    models: ModelSet,
    runId: string,
    inputType: string,
    inputData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get current shared state
      const flow = await this.getOrAttachFlow(kv, models, runId);
      if (!flow) {
        return { success: false, message: "Flow not found" };
      }

      const shared = await flow.getShared();
      if (!shared) {
        return { success: false, message: "Flow state not found" };
      }

      // Validate that flow is waiting for this type of input
      if (shared.callToAction !== inputType) {
        return {
          success: false,
          message: `Flow is not waiting for ${inputType}, current callToAction: ${
            shared.callToAction || "none"
          }`,
        };
      }

      // Update shared state based on input type
      switch (inputType) {
        case "improve_basic_input":
          shared.basic = { ...shared.basic, ...inputData };
          break;

        case "user_feedback":
          shared.userFeedback = inputData;
          break;

        case "finish":
          return {
            success: true,
            message: "Flow completed successfully",
          };

        default:
          return {
            success: false,
            message: `Unknown input type: ${inputType}`,
          };
      }

      // Clear callToAction to indicate user input has been processed
      shared.callToAction = null;

      // Save updated state
      await flow.setShared(shared);

      // Release flow object
      this.activeFlows.delete(runId);

      // Trigger flow continuation in background
      this.triggerFlow(kv, models, runId).catch((error) => {
        console.error(`Failed to resume flow ${runId}:`, error);
      });

      return { success: true, message: "User input processed successfully" };
    } catch (error) {
      console.error(`Error handling user input for flow ${runId}:`, error);
      return {
        success: false,
        message: "Internal error processing user input",
      };
    }
  }

  /**
   * Get flow by ID and return shared state (for API responses)
   * Only reads existing flow data directly from KV storage
   */
  static async getFlowById(
    kv: KVStore,
    runId: string
  ): Promise<{ shared: SharedStorage | null; exists: boolean }> {
    try {
      // Read directly from storage
      const flowKey = `flow:${runId}`;
      const flowRecord = await kv.read<{
        flowName: string;
        params: Record<string, unknown>;
        shared: SharedStorage;
        createdAt: string;
        nodes: Array<any>;
      }>(flowKey);

      if (!flowRecord) {
        return { shared: null, exists: false };
      }

      return { shared: flowRecord.shared || null, exists: true };
    } catch (error) {
      return { shared: null, exists: false };
    }
  }

  /**
   * Get existing flow from memory or attach from storage
   */
  private static async getOrAttachFlow(
    kv: KVStore,
    models: ModelSet,
    runId: string
  ): Promise<PersistedFlow<SharedStorage> | null> {
    // Check if flow exists in memory
    let flow = this.activeFlows.get(runId);

    if (!flow) {
      // Try to attach from storage
      try {
        const startNode = createFlowNodes(models);
        flow = await PersistedFlow.attach<SharedStorage>(kv, runId, startNode);
        this.activeFlows.set(runId, flow);
      } catch (error) {
        console.error(`Failed to attach flow ${runId}:`, error);
        return null;
      }
    }

    return flow;
  }

  /**
   * Initialize a new flow (create record only, no execution)
   */
  static async initializeFlow(
    kv: KVStore,
    models: ModelSet,
    runId: string,
    shared: SharedStorage
  ): Promise<{ success: boolean }> {
    try {
      const startNode = createFlowNodes(models);
      const flow = new PersistedFlow<SharedStorage>(startNode, kv, runId);

      // Only initialize the record, no execution
      await flow.init(shared);

      // Release flow object immediately
      this.activeFlows.delete(runId);

      return { success: true };
    } catch (error) {
      console.error(`Failed to initialize flow ${runId}:`, error);
      return { success: false };
    }
  }

  /**
   * Delete a flow and all its related data
   */
  static async deleteFlow(
    kv: KVStore,
    runId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Remove from memory if exists
      this.activeFlows.delete(runId);

      // Delete the flow record from storage
      const flowKey = `flow:${runId}`;

      if (kv.delete) {
        await kv.delete(flowKey);
      } else {
        // Fallback for KV stores that don't support delete
        console.warn(
          `KV store doesn't support delete operation for ${flowKey}`
        );
      }

      return {
        success: true,
        message: "Flow deleted successfully",
      };
    } catch (error) {
      console.error(`Failed to delete flow ${runId}:`, error);
      return {
        success: false,
        message: "Failed to delete flow",
      };
    }
  }

  /**
   * List all flows with basic information
   */
  static async listFlows(kv: KVStore): Promise<{
    success: boolean;
    flows: Array<{
      runId: string;
      basic: any;
      createdAt: string;
      completed: boolean;
    }>;
  }> {
    try {
      // Check if KV store supports listKeys
      if (!kv.listKeys) {
        console.warn("KV store doesn't support listKeys operation");
        return { success: false, flows: [] };
      }

      // Get all flow keys
      const flowKeys = await kv.listKeys("flow:");
      const flows = [];

      // Read each flow's basic information
      for (const key of flowKeys) {
        try {
          const flowRecord = await kv.read<{
            flowName: string;
            params: Record<string, unknown>;
            shared: any;
            createdAt: string;
            nodes: Array<any>;
          }>(key);

          if (flowRecord) {
            const runId = key.replace("flow:", "");
            flows.push({
              runId,
              basic: flowRecord.shared?.basic || {},
              createdAt: flowRecord.createdAt,
              completed: flowRecord.shared?.completed || false,
            });
          }
        } catch (error) {
          console.error(`Failed to read flow record for key ${key}:`, error);
          // Continue processing other flows
        }
      }

      // Sort by creation date (newest first)
      flows.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { success: true, flows };
    } catch (error) {
      console.error("Failed to list flows:", error);
      return { success: false, flows: [] };
    }
  }
}
