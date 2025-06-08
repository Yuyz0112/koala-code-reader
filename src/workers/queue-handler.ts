import { FlowExecutionMessage, FlowManager } from "../code-reader/flow-manager";
import { createModels } from "../routes/flows";
import { R2KVStore } from "../code-reader/flow";

// Helper function to create KV store
async function createKVStore(environment: CloudflareBindings) {
  if (!environment.FLOW_STORAGE_BUCKET) {
    throw new Error(
      "FLOW_STORAGE_BUCKET is required for persistent flow storage"
    );
  }
  return new R2KVStore(environment.FLOW_STORAGE_BUCKET);
}

/**
 * Queue consumer for flow execution
 * Handles background flow processing tasks
 */
export async function handleFlowQueue(
  batch: MessageBatch<FlowExecutionMessage & { timestamp: number }>,
  env: CloudflareBindings
) {
  console.log(
    `[Queue] Processing batch with ${batch.messages.length} messages`
  );

  for (const message of batch.messages) {
    try {
      const { runId, action, timestamp } = message.body;

      console.log(
        `[Queue] Processing ${action} for flow ${runId} (queued at ${new Date(
          timestamp
        ).toISOString()})`
      );

      // Create required dependencies
      const kvStore = await createKVStore(env);
      const models = createModels(env);

      // Execute the flow
      await FlowManager.triggerFlow(kvStore, models, runId);

      // Acknowledge successful processing
      message.ack();

      console.log(
        `[Queue] Successfully processed ${action} for flow ${runId}`
      );
    } catch (error) {
      console.error(
        `[Queue] Error processing message for flow ${message.body?.runId}:`,
        error
      );

      // Retry the message (don't ack, let it retry)
      message.retry();
    }
  }
}
