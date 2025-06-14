import { PersistedFlow } from "./persisted-flow";
import { createFlowNodes } from "./flow";
import { SharedStorage } from "./utils/storage";
import type { KVStore } from "./persisted-flow";
import { ModelSet } from "./utils/llm";
import { MemoryLayer } from "./utils/memory-layer";

// Heartbeat configuration constants
const HEARTBEAT_INTERVAL = 10 * 1000; // 10 seconds
const HEARTBEAT_TIMEOUT = 3 * HEARTBEAT_INTERVAL; // 30 seconds (3x interval)
const ACTIVE_THRESHOLD = 2 * HEARTBEAT_INTERVAL; // 20 seconds

export type FlowExecutionMessage = {
  runId: string;
  action: "trigger" | "resume";
};

/**
 * Flow Manager - handles flow lifecycle with memory optimization
 *
 * Core principles:
 * 1. Flow objects are created on-demand and released after execution
 * 2. Execution continues until reaching a callToAction (user interaction point)
 * 3. Background execution is handled through Cloudflare Queue for persistence
 */
export class FlowManager {
  private static activeFlows = new Map<string, PersistedFlow<SharedStorage>>();
  private static heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Check if another handler is actively processing a flow based on heartbeat
   */
  private static isFlowActivelyProcessed(shared: SharedStorage): boolean {
    if (!shared.lastHeartbeat) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - shared.lastHeartbeat;
    return timeSinceLastHeartbeat < ACTIVE_THRESHOLD;
  }

  /**
   * Check if a flow's heartbeat has expired (for self-healing)
   */
  private static isHeartbeatExpired(shared: SharedStorage): boolean {
    if (!shared.lastHeartbeat) {
      return true;
    }

    const now = Date.now();
    const timeSinceLastHeartbeat = now - shared.lastHeartbeat;
    return timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT;
  }

  /**
   * Start independent heartbeat updates for a flow
   */
  private static startHeartbeatUpdates(
    flow: PersistedFlow<SharedStorage>,
    runId: string
  ): void {
    // Clear any existing heartbeat interval
    this.stopHeartbeatUpdates(runId);

    // Immediately update heartbeat first to mark flow as actively processing
    const updateHeartbeat = async () => {
      try {
        const shared = await flow.getShared();
        if (shared) {
          shared.lastHeartbeat = Date.now();
          await flow.setShared(shared);
          console.log(`[FlowManager] Heartbeat updated for flow ${runId}`);
        }
      } catch (error) {
        console.error(
          `[FlowManager] Failed to update heartbeat for flow ${runId}:`,
          error
        );
        // Clear the interval on error to prevent further attempts
        this.stopHeartbeatUpdates(runId);
      }
    };

    // Update immediately
    updateHeartbeat();

    // Then set up periodic updates
    const intervalId = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL);
    this.heartbeatIntervals.set(runId, intervalId);
  }

  /**
   * Stop heartbeat updates for a flow
   */
  private static stopHeartbeatUpdates(runId: string): void {
    const intervalId = this.heartbeatIntervals.get(runId);
    if (intervalId) {
      clearInterval(intervalId);
      this.heartbeatIntervals.delete(runId);
    }
  }

  /**
   * Queue a flow execution task (replaces direct async execution)
   */
  static async queueFlowExecution(
    queue: Queue<FlowExecutionMessage & { timestamp: number }>,
    message: FlowExecutionMessage
  ): Promise<void> {
    const { runId, action } = message;
    console.log(
      `[FlowManager] Queueing flow execution for runId: ${runId}, action: ${action}`
    );

    try {
      await queue.send({ ...message, timestamp: Date.now() });
      console.log(
        `[FlowManager] Successfully queued flow execution for ${runId}`
      );
    } catch (error) {
      console.error(
        `[FlowManager] Failed to queue flow execution for ${runId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Trigger flow execution in background (async)
   * This is the core "step to next call to action" logic
   */
  static async triggerFlow(
    kv: KVStore,
    models: ModelSet,
    memoryLayer: MemoryLayer,
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

    let flow: PersistedFlow<SharedStorage> | null = null;

    try {
      console.log(`[FlowManager] Attempting to get or attach flow ${runId}`);
      flow = await this.getOrAttachFlow(kv, models, memoryLayer, runId);
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

      // Check if another handler is already actively processing this flow
      if (shared && this.isFlowActivelyProcessed(shared)) {
        const timeSinceLastHeartbeat = Date.now() - (shared.lastHeartbeat || 0);
        console.log(
          `[FlowManager] Flow ${runId} appears to be actively processed by another handler (heartbeat ${timeSinceLastHeartbeat}ms ago), skipping`
        );
        return;
      }

      console.log(`[FlowManager] Starting flow execution for ${runId}`);

      // Start independent heartbeat updates
      this.startHeartbeatUpdates(flow, runId);

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
      // Always stop heartbeat updates and release memory object
      this.stopHeartbeatUpdates(runId);
      this.activeFlows.delete(runId);

      // Clear heartbeat from storage to indicate no active handler
      if (flow) {
        try {
          const shared = await flow.getShared();
          if (shared) {
            shared.lastHeartbeat = undefined;
            await flow.setShared(shared);
            console.log(`[FlowManager] Cleared heartbeat for flow ${runId}`);
          }
        } catch (error) {
          console.error(
            `[FlowManager] Failed to clear heartbeat for flow ${runId}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Handle user input and queue flow resumption
   */
  static async handleUserInput(
    kv: KVStore,
    models: ModelSet,
    memoryLayer: MemoryLayer,
    queue: Queue<FlowExecutionMessage>,
    runId: string,
    inputType: string,
    inputData: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get current shared state
      const flow = await this.getOrAttachFlow(kv, models, memoryLayer, runId);
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

      // Clear heartbeat to allow immediate flow resumption
      shared.lastHeartbeat = undefined;

      // Save updated state
      await flow.setShared(shared);

      // Release flow object
      this.activeFlows.delete(runId);

      // Queue flow continuation instead of direct async call
      await this.queueFlowExecution(queue, {
        runId,
        action: "resume",
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
    memoryLayer: MemoryLayer,
    runId: string
  ): Promise<PersistedFlow<SharedStorage> | null> {
    // Check if flow exists in memory
    let flow = this.activeFlows.get(runId);

    if (!flow) {
      // Try to attach from storage
      try {
        const startNode = createFlowNodes(models, memoryLayer, runId);
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
    memoryLayer: MemoryLayer,
    runId: string,
    shared: SharedStorage
  ): Promise<{ success: boolean }> {
    try {
      const startNode = createFlowNodes(models, memoryLayer, runId);
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
      // Clean up heartbeat intervals and remove from memory if exists
      this.stopHeartbeatUpdates(runId);
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

  /**
   * Check if a flow needs resumption and queue it (self-healing mechanism)
   * This replaces the previous client-driven self-healing with queue-based approach
   * Uses heartbeat mechanism to prevent duplicate flow handlers
   */
  static async checkAndQueueFlowResumption(
    kv: KVStore,
    queue: Queue<FlowExecutionMessage>,
    runId: string,
    shared: SharedStorage
  ): Promise<void> {
    try {
      // Only queue resumption if flow is not completed and not waiting for user input
      if (!shared.completed && !shared.callToAction) {
        // Use the abstracted heartbeat detection logic
        if (this.isHeartbeatExpired(shared)) {
          const timeSinceLastHeartbeat =
            Date.now() - (shared.lastHeartbeat || 0);
          console.log(
            `[FlowManager] Self-healing: Flow ${runId} heartbeat expired (${timeSinceLastHeartbeat}ms > ${HEARTBEAT_TIMEOUT}ms), queueing resumption...`
          );

          await this.queueFlowExecution(queue, {
            runId,
            action: "trigger",
          });

          console.log(
            `[FlowManager] Self-healing: Successfully queued flow ${runId} for resumption due to heartbeat timeout`
          );
        }
      }
    } catch (error) {
      console.error(
        `[FlowManager] Self-healing: Failed to queue flow ${runId} for resumption:`,
        error
      );
      // Don't throw - self-healing should be best-effort
    }
  }
}
