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
   * Execute one step and return immediately (for synchronous API responses)
   */
  static async executeOneStep(
    kv: KVStore,
    models: ModelSet,
    runId: string
  ): Promise<boolean> {
    const flow = await this.getOrAttachFlow(kv, models, runId);
    if (!flow) return false;

    const hasMore = await flow.step();

    // Release flow object immediately after step
    this.activeFlows.delete(runId);

    return hasMore;
  }

  /**
   * Trigger flow execution in background (async)
   * This is the core "step to next call to action" logic
   */
  static async triggerFlow(
    kv: KVStore,
    models: ModelSet,
    runId: string
  ): Promise<void> {
    // Check if flow is already running in memory
    if (this.activeFlows.has(runId)) {
      // Flow is already being processed, do nothing
      return;
    }

    try {
      const flow = await this.getOrAttachFlow(kv, models, runId);
      if (!flow) return;

      // First check if flow is already waiting for user input
      let shared = await flow.getShared();
      if (shared?.callToAction) {
        console.log(
          `Flow ${runId} already paused at callToAction: ${shared.callToAction}`
        );
        return; // Don't execute anything, just return
      }

      // Keep stepping until we hit a callToAction or flow completes
      while (await flow.step()) {
        shared = await flow.getShared();

        // Check if we've hit a user interaction point after this step
        if (shared?.callToAction) {
          console.log(
            `Flow ${runId} paused at callToAction: ${shared.callToAction}`
          );
          break;
        }
      }
    } catch (error) {
      console.error(`Flow ${runId} execution error:`, error);
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
   */
  static async getFlowById(
    kv: KVStore,
    models: ModelSet,
    runId: string
  ): Promise<{ shared: SharedStorage | null; exists: boolean }> {
    try {
      const flow = await this.getOrAttachFlow(kv, models, runId);
      if (!flow) {
        return { shared: null, exists: false };
      }

      const shared = await flow.getShared();

      // Release flow object immediately after reading
      this.activeFlows.delete(runId);

      return { shared: shared || null, exists: true };
    } catch (error) {
      console.error(`Failed to get flow ${runId}:`, error);
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
}
