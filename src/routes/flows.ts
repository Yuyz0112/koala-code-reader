import { Hono } from "hono";
import { env } from "hono/adapter";
import { createOpenAI } from "@ai-sdk/openai";
import { FlowManager } from "../code-reader/flow-manager";
import type { SharedStorage } from "../code-reader/utils/storage";
import { R2KVStore } from "../code-reader/flow";

const flows = new Hono();

// Helper function to create KV store
async function createKVStore(environment: CloudflareBindings) {
  if (!environment.FLOW_STORAGE_BUCKET) {
    throw new Error(
      "FLOW_STORAGE_BUCKET is required for persistent flow storage"
    );
  }

  return new R2KVStore(environment.FLOW_STORAGE_BUCKET);
}

export function createModels(environment: CloudflareBindings) {
  const models = {
    default: createOpenAI({
      apiKey: environment.OPENAI_API_KEY as string,
      baseURL: `https://clear-robin-12.deno.dev/v1`,
    })("gpt-4o"),
  };

  return models;
}

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
      summariesBuffer: [],
      reducedOutput: "",
      completed: false,
    };

    // Get KV store
    const kvStore = await createKVStore(c.env as CloudflareBindings);

    // Initialize models
    const models = createModels(c.env as CloudflareBindings);

    const flowRunId = runId || crypto.randomUUID();

    // Initialize flow
    const result = await FlowManager.initializeFlow(
      kvStore,
      models,
      flowRunId,
      shared
    );

    if (!result.success) {
      return c.json({ error: "Failed to initialize flow" }, 500);
    }

    // Trigger flow execution in background
    FlowManager.triggerFlow(kvStore, models, flowRunId).catch((error) => {
      console.error("Background flow execution error:", error);
    });

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
    const models = createModels(c.env as CloudflareBindings);

    const result = await FlowManager.getFlowById(kvStore, models, runId);
    if (!result.exists || !result.shared) {
      return c.json({ error: "Flow not found" }, 404);
    }

    // Trigger flow execution in background (self-healing)
    FlowManager.triggerFlow(kvStore, models, runId).catch((error) => {
      console.error("Background flow trigger error:", error);
    });

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

    // Handle user input via FlowManager
    const result = await FlowManager.handleUserInput(
      kvStore,
      models,
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
