import { Hono } from "hono";
import { FlowManager } from "../code-reader/flow-manager";
import type { SharedStorage } from "../code-reader/utils/storage";
import { createKVStore } from "../code-reader/providers/r2-kv-store";
import { createModels } from "../code-reader/providers/model";
import { createMemoryLayer } from "../code-reader/providers/memory-layer";

const flows = new Hono();

// List all flows
flows.get("/", async (c) => {
  try {
    const kvStore = await createKVStore(c.env as CloudflareBindings);

    const result = await FlowManager.listFlows(kvStore);

    if (!result.success) {
      return c.json({ error: "Failed to list flows" }, 500);
    }

    return c.json({
      flows: result.flows,
      total: result.flows.length,
    });
  } catch (error: any) {
    return c.json({ error: `Failed to list flows: ${error.message}` }, 500);
  }
});

// Create a new flow
flows.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { basic, runId } = body;

    if (!basic || !basic.repoName || !basic.mainGoal) {
      return c.json(
        { error: "Missing required fields: repoName or mainGoal" },
        400
      );
    }

    const shared: SharedStorage = {
      basic,
      reducedOutput: "",
      completed: false,
      lastHeartbeat: Date.now(), // Initialize heartbeat for new flows
    };

    // Get KV store
    const kvStore = await createKVStore(c.env as CloudflareBindings);

    // Initialize models
    const models = createModels(c.env as CloudflareBindings);

    // Create memory layer
    const memoryLayer = createMemoryLayer(models, c.env as CloudflareBindings);

    const flowRunId = runId || crypto.randomUUID();

    // Initialize flow
    const result = await FlowManager.initializeFlow(
      kvStore,
      models,
      memoryLayer,
      flowRunId,
      shared
    );

    if (!result.success) {
      return c.json({ error: "Failed to initialize flow" }, 500);
    }

    // Queue flow execution instead of direct async call
    await FlowManager.queueFlowExecution(
      (c.env as CloudflareBindings).FLOW_QUEUE,
      { runId: flowRunId, action: "trigger" }
    );

    return c.json({
      runId: flowRunId,
      status: "started",
      message: "Flow has been started successfully",
    });
  } catch (error: any) {
    return c.json({ error: `Failed to create flow: ${error.message}` }, 500);
  }
});

flows.get("/:runId", async (c) => {
  try {
    const { runId } = c.req.param();

    const kvStore = await createKVStore(c.env as CloudflareBindings);

    const result = await FlowManager.getFlowById(kvStore, runId);
    if (!result.exists || !result.shared) {
      return c.json({ error: "Flow not found" }, 404);
    }

    // Self-healing: Check if flow needs resumption and queue it
    await FlowManager.checkAndQueueFlowResumption(
      kvStore,
      (c.env as CloudflareBindings).FLOW_QUEUE,
      runId,
      result.shared
    );

    return c.json({
      runId,
      shared: result.shared,
    });
  } catch (error: any) {
    return c.json(
      { error: `Failed to get flow status: ${error.message}` },
      500
    );
  }
});

// Submit user input to a waiting flow
flows.post("/:runId/input", async (c) => {
  try {
    const { runId } = c.req.param();
    const body = await c.req.json();
    const { inputType, inputData } = body;

    if (!inputType || !inputData) {
      return c.json(
        { error: "Missing required fields: inputType and inputData" },
        400
      );
    }

    const kvStore = await createKVStore(c.env as CloudflareBindings);
    const models = createModels(c.env as CloudflareBindings);

    // Create memory layer
    const memoryLayer = createMemoryLayer(models, c.env as CloudflareBindings);

    // Handle user input via FlowManager
    const result = await FlowManager.handleUserInput(
      kvStore,
      models,
      memoryLayer,
      (c.env as CloudflareBindings).FLOW_QUEUE,
      runId,
      inputType,
      inputData
    );

    if (!result.success) {
      return c.json({ error: result.message }, 400);
    }

    return c.json({
      runId,
      status: "resumed",
      message: result.message,
    });
  } catch (error: any) {
    return c.json(
      { error: `Failed to submit user input: ${error.message}` },
      500
    );
  }
});

// Delete a flow
flows.delete("/:runId", async (c) => {
  try {
    const { runId } = c.req.param();

    const kvStore = await createKVStore(c.env as CloudflareBindings);

    // Delete flow via FlowManager
    const result = await FlowManager.deleteFlow(kvStore, runId);

    if (!result.success) {
      return c.json({ error: result.message }, 500);
    }

    return c.json({
      runId,
      status: "deleted",
      message: result.message,
    });
  } catch (error: any) {
    return c.json({ error: `Failed to delete flow: ${error.message}` }, 500);
  }
});

export { flows };
