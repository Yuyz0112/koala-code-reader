import { Hono } from "hono";
import { routes } from "./routes";
import { handleFlowQueue } from "./workers";
import type { FlowExecutionMessage } from "./code-reader/flow-manager";

const app = new Hono<{
  Bindings: CloudflareBindings;
}>();

// Mount API routes
app.route("/api", routes);

export default {
  fetch: app.fetch,

  // Queue consumer for flow execution
  async queue(
    batch: MessageBatch<FlowExecutionMessage & { timestamp: number }>,
    env: CloudflareBindings
  ) {
    await handleFlowQueue(batch, env);
  },
};
