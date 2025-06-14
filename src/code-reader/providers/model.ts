import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function createModels(environment: CloudflareBindings) {
  const models = {
    default:
      createGoogleGenerativeAI({
        apiKey: environment.GOOGLE_GENERATIVE_AI_API_KEY,
      })("gemini-2.0-flash-lite") ??
      createOpenAI({
        apiKey: environment.OPENAI_API_KEY as string,
        baseURL: `https://clear-robin-12.deno.dev/v1`,
      })("gpt-4o"),
  };

  return models;
}
