import { createOpenAI } from "@ai-sdk/openai";

export function createModels(environment: CloudflareBindings) {
  const openrouter = createOpenAI({
    apiKey: environment.OPENROUTER_API_KEY,
    baseURL: `https://openrouter.ai/api/v1`,
  });

  const qwen = createOpenAI({
    apiKey: environment.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });

  const models = {
    default: openrouter("google/gemini-2.5-flash"),
    agent: openrouter("google/gemini-2.5-flash"),
    embed: qwen.embedding("text-embedding-v4"),
  };

  return models;
}
