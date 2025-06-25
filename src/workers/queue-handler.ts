import { FlowExecutionMessage, FlowManager } from "../code-reader/flow-manager";
import { createKVStore } from "../code-reader/providers/r2-kv-store";
import { createModels } from "../code-reader/providers/model";
import { createMemoryLayer } from "../code-reader/providers/memory-layer";

/**
 * Queue consumer for flow execution
 * Handles background flow processing tasks with enhanced reliability
 */
export async function handleFlowQueue(
  batch: MessageBatch<FlowExecutionMessage & { timestamp: number }>,
  env: CloudflareBindings
) {
  console.log(
    `[Queue] Processing batch with ${batch.messages.length} messages`
  );

  for (const message of batch.messages) {
    const messageId = `${message.body?.runId}-${message.body?.timestamp}`;

    try {
      const { runId, action, timestamp } = message.body;

      console.log(
        `[Queue] Processing ${action} for flow ${runId} (queued at ${new Date(
          timestamp
        ).toISOString()})`
      );

      // Check message age to avoid processing stale messages
      const messageAge = Date.now() - timestamp;
      const MAX_MESSAGE_AGE = 10 * 60 * 1000; // 10 minutes

      if (messageAge > MAX_MESSAGE_AGE) {
        console.warn(
          `[Queue] Message for flow ${runId} is too old (${messageAge}ms), skipping`
        );
        message.ack();
        continue;
      }

      // Create required dependencies
      const kvStore = await createKVStore(env);
      const models = createModels(env);

      // Create memory layer with production providers
      const memoryLayer = createMemoryLayer(models, env);

      // Add execution timeout protection
      const executionPromise = FlowManager.triggerFlow(
        kvStore,
        models,
        memoryLayer,
        runId
      );
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Flow execution timeout")),
          5 * 60 * 1000
        ); // 5 minutes
      });

      await Promise.race([executionPromise, timeoutPromise]);

      // Acknowledge successful processing
      message.ack();

      console.log(`[Queue] Successfully processed ${action} for flow ${runId}`);
    } catch (error) {
      console.error(`[Queue] Error processing message ${messageId}:`, error);

      // Enhanced retry logic with exponential backoff consideration
      const retryCount = message.attempts || 1;
      const maxRetries = 3;

      if (retryCount >= maxRetries) {
        console.error(
          `[Queue] Message ${messageId} exceeded max retries (${maxRetries}), moving to DLQ`
        );
        // Let the message go to dead letter queue by not acking or retrying
        return;
      }

      console.log(
        `[Queue] Retrying message ${messageId} (attempt ${
          retryCount + 1
        }/${maxRetries})`
      );
      message.retry();
    }
  }
}
