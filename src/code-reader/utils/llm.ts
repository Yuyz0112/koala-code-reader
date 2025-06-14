import { parse as parseYaml } from "yaml";
import {
  getEntryFilePrompt,
  analyzeFilePrompt,
  reduceHistoryPrompt,
} from "./prompts";
import { SharedStorage } from "./storage";
import { streamText, LanguageModelV1 } from "ai";

function parseMessageToYaml<T = any>(input: string): T {
  const yamlCodeBlockRegex = /```(?:ya?ml)\s*\n([\s\S]*?)\n```/gi;

  const matches = Array.from(input.matchAll(yamlCodeBlockRegex));

  if (matches.length > 1) {
    throw new Error("Multiple YAML code blocks found in the input string.");
  }

  const yamlString = matches.length === 1 ? matches[0][1].trim() : input.trim();

  try {
    return parseYaml(yamlString) as T;
  } catch (error) {
    throw new Error("Failed to parse YAML: " + error + "\n\n" + yamlString);
  }
}

async function streamToText(
  model: LanguageModelV1,
  prompt: string
): Promise<string> {
  const startTime = Date.now();
  let chunks = 0;
  let totalChars = 0;
  let accumulatedText = "";

  console.log(`[LLM] Starting stream generation`);

  const { textStream } = streamText({
    model,
    prompt,
  });

  for await (const textChunk of textStream) {
    chunks++;
    totalChars += textChunk.length;
    accumulatedText += textChunk;

    const elapsed = Date.now() - startTime;
    const charsPerSecond = totalChars / (elapsed / 1000);

    console.debug(
      `[LLM] Chunk ${chunks}: +${
        textChunk.length
      } chars, total: ${totalChars} chars, speed: ${charsPerSecond.toFixed(
        1
      )} chars/s`
    );
  }

  const totalTime = Date.now() - startTime;
  const avgSpeed = totalChars / (totalTime / 1000);

  return accumulatedText;
}

export type ModelSet = {
  default: LanguageModelV1;
};

export class LLM {
  models: ModelSet;

  constructor(models: ModelSet) {
    this.models = models;
  }

  async getEntryFile(params: Pick<SharedStorage, "basic">) {
    const prompt = getEntryFilePrompt(params);

    try {
      const text = await streamToText(this.models.default, prompt);

      const result = parseMessageToYaml<{
        decision: "entry_file_found" | "need_more_info";
        next_file?: {
          name: string;
          reason: string;
        };
        ask_user?: string;
      }>(text);

      return result;
    } catch (error) {
      console.error(`[LLM] getEntryFile failed:`, error);
      throw new Error(
        `LLM getEntryFile call failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async analyzeFile(
    params: Pick<
      SharedStorage,
      "basic" | "nextFile" | "currentFile" | "userFeedback"
    >,
    toAnalyzeContent: string,
    relevantContexts: string[] = [] // Add context parameter with default empty array
  ) {
    const prompt = analyzeFilePrompt(
      params,
      toAnalyzeContent,
      relevantContexts
    );

    try {
      const text = await streamToText(this.models.default, prompt);

      const result = parseMessageToYaml<
        | {
            current_analysis: {
              filename: string;
              understanding: string;
            };
            next_focus_proposal: {
              next_filename: string;
              reason: string;
            };
          }
        | {
            analysis_complete: true;
            final_understanding: string;
          }
      >(text);

      return result;
    } catch (error) {
      console.error(`[LLM] analyzeFile failed:`, error);
      throw new Error(
        `LLM analyzeFile call failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async reduceHistory(
    params: Pick<
      SharedStorage,
      "basic" | "reducedOutput" | "understandingsBuffer" | "userFeedback"
    >
  ) {
    const prompt = reduceHistoryPrompt(params);

    try {
      const text = await streamToText(this.models.default, prompt);

      const result = parseMessageToYaml<{
        reduced_output: string;
      }>(text);

      return result;
    } catch (error) {
      console.error(`[LLM] reduceHistory failed:`, error);
      throw new Error(
        `LLM reduceHistory call failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
