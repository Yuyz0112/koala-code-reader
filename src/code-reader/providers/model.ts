import { createOpenAI } from "@ai-sdk/openai";

export function createModels(environment: CloudflareBindings) {
  const models = {
    default: createOpenAI({
      apiKey: environment.OPENAI_API_KEY as string,
      baseURL: `https://clear-robin-12.deno.dev/v1`,
    })("gpt-4o"),
  };

  return models;
}
