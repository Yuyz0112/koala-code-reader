import { Hono } from "hono";
import { env } from "hono/adapter";
import { createOpenAI } from "@ai-sdk/openai";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import { createR2PersistedFlow, createPersistedFlow } from "./code-reader/flow";
import { eventBus, SharedStorage } from "./code-reader/utils/storage";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { PersistedFlow } from "./code-reader/persisted-flow";

const app = new Hono();

// GitHub API proxy endpoint to avoid CORS issues
app.get("/api/github/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const ref = c.req.query("ref") || "main"; // Get ref from query parameter, default to 'main'

  try {
    // Get GitHub API key from environment variables
    const githubToken = env(c).GITHUB_TOKEN;

    // Set up headers with optional authorization
    const headers: Record<string, string> = {
      "User-Agent": "Koala-Code-Reader",
      Accept: "application/vnd.github.v3+json",
    };

    if (githubToken) {
      headers["Authorization"] = `token ${githubToken}`;
    }

    // @ts-ignore
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );
    if (!repoResponse.ok) {
      return c.json(
        { error: `Repository not found: ${repoResponse.status}` },
        repoResponse.status as ContentfulStatusCode
      );
    }

    // Try the specified ref directly
    // @ts-ignore
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
      { headers }
    );
    if (!treeResponse.ok) {
      return c.json(
        {
          error: `Unable to fetch repository contents for ref '${ref}': ${treeResponse.status}. Please check if the branch/tag exists.`,
        },
        treeResponse.status as ContentfulStatusCode
      );
    }

    const repoData = await repoResponse.json<{
      name: string;
      full_name: string;
      description: string | null;
    }>();
    const treeData = await treeResponse.json<{
      tree: unknown;
    }>();

    return c.json({
      name: repoData.name,
      full_name: repoData.full_name,
      description: repoData.description,
      ref: ref, // Include the ref in the response
      tree: treeData.tree,
    });
  } catch (error: any) {
    return c.json(
      {
        error: `Failed to fetch repository: ${
          error?.message || "Unknown error"
        }`,
      },
      500
    );
  }
});

// WebSocket API endpoint
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const models = {
      default: createOpenAI({
        apiKey: env(c).OPENAI_API_KEY,
        baseURL: `https://clear-robin-12.deno.dev/v1`,
      })("gpt-4o"),
    };

    const shared: SharedStorage = {
      basic: {
        repoName: "",
        mainGoal: "",
        files: [],
      },
      allSummaries: [],
      summariesBuffer: [],
      reducedOutput: "",
      completed: false,
      __ctx: {
        models,
      },
    };

    // Store flow instance for this WebSocket connection
    let currentFlow: PersistedFlow<SharedStorage> | null = null;

    return {
      onMessage(evt: any, ws: any) {
        try {
          const data = JSON.parse(evt.data);

          // console.log(data.type, data.value);

          switch (data.type) {
            case "start": {
              eventBus.on("send", (data) => {
                ws.send(data);
              });

              shared.basic = data.value;

              const environment = c.env as CloudflareBindings;
              if (environment.FLOW_STORAGE_BUCKET) {
                currentFlow = createR2PersistedFlow(
                  environment.FLOW_STORAGE_BUCKET
                );
              } else {
                // Fallback to in-memory storage for development
                console.warn(
                  "R2 bucket not configured, using in-memory storage"
                );
                const memoryKV = new Map();
                const memoryKVStore = {
                  read: async (key: string) => memoryKV.get(key),
                  write: async (key: string, value: any) => {
                    memoryKV.set(key, value);
                  },
                };
                currentFlow = createPersistedFlow(memoryKVStore);
              }

              if (currentFlow) {
                currentFlow.run(shared);
              } else {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "Failed to initialize flow",
                    timestamp: new Date().toISOString(),
                  })
                );
              }
              break;
            }
            case "generateText": {
              eventBus.emit("generateText", data.value);
              break;
            }
            case "improveBasicInput": {
              eventBus.emit("improveBasicInput", data.value);
              break;
            }
            case "userFeedback": {
              eventBus.emit("userFeedback", data.value);
              break;
            }
            case "readFile": {
              eventBus.emit("readFile", data.value);
              break;
            }
            default:
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Unknown message type: ${data.type}`,
                  timestamp: new Date().toISOString(),
                })
              );
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: "error",
              message:
                "Invalid message format. Expected JSON with 'type' and 'value' fields.",
              timestamp: new Date().toISOString(),
            })
          );
        }
      },
    };
  })
);

export default app;
