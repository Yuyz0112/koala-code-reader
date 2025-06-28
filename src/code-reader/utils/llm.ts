import { parse as parseYaml } from "yaml";
import {
  getEntryFilePrompt,
  analyzeFilePrompt,
  agenticWriterPrompt,
} from "./prompts";
import { SharedStorage } from "./storage";
import { streamText, generateText, LanguageModelV1 } from "ai";
import { EmbeddingModelV1 } from "@ai-sdk/provider";
import { createAgenticWriterTools } from "./tools";
import { MemoryLayer } from "./memory-layer";

function parseMessageToYaml<T = any>(input: string): T {
  if (!input || typeof input !== "string") {
    throw new Error("Input must be a non-empty string");
  }

  // First try to extract YAML from code blocks
  const yamlCodeBlockRegex = /```(?:ya?ml)\s*\n([\s\S]*?)\n```/gi;
  const matches = Array.from(input.matchAll(yamlCodeBlockRegex));

  if (matches.length > 1) {
    throw new Error("Multiple YAML code blocks found in the input string.");
  }

  let yamlString: string;
  if (matches.length === 1) {
    yamlString = matches[0][1].trim();
    console.log(
      `[YAML Parse] Extracted YAML from code block (${yamlString.length} chars)`
    );
  } else {
    // If no code blocks, try to parse the entire input as YAML
    yamlString = input.trim();

    // Check if it looks like YAML (starts with common YAML patterns)
    const yamlPatterns = [
      /^status:\s*["']?(complete|insufficient_info)["']?/m,
      /^final_analysis:\s*[|>]/m,
      /^reason:\s*[|>]/m,
      /^current_findings:\s*[|>]/m,
      /^[\w_]+:\s*[^\n]/m, // Generic key-value pattern
    ];

    const hasYamlPattern = yamlPatterns.some((pattern) =>
      pattern.test(yamlString)
    );
    if (!hasYamlPattern) {
      throw new Error(
        `Input does not appear to contain valid YAML format. First 200 chars: ${yamlString.substring(
          0,
          200
        )}`
      );
    }
    console.log(
      `[YAML Parse] Parsing entire input as YAML (${yamlString.length} chars)`
    );
  }

  if (!yamlString) {
    throw new Error("No YAML content found in the input string.");
  }

  try {
    const parsed = parseYaml(yamlString) as T;

    console.log(`[YAML Parse] Successfully parsed YAML object`);
    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse YAML: ${errorMessage}\n\nYAML content (first 500 chars):\n${yamlString.substring(
        0,
        500
      )}`
    );
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
    temperature: 0.1,
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
  agent: LanguageModelV1;
  embed: EmbeddingModelV1<string>;
};

export class LLM {
  models: ModelSet;
  githubToken: string;

  constructor(models: ModelSet, githubToken: string) {
    this.models = models;
    this.githubToken = githubToken;
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
    toAnalyze: {
      name: string;
      content: string;
    },
    relevantContexts: string[] = [] // Add context parameter with default empty array
  ) {
    const prompt = analyzeFilePrompt(params, toAnalyze, relevantContexts);

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

  async agenticWriter(
    params: Pick<SharedStorage, "basic"> & {
      memoryLayer: MemoryLayer;
      completed: boolean;
    }
  ) {
    console.log(
      `[LLM] AgenticWriter starting with ${
        params.completed ? "completed" : "in-progress"
      } analysis`
    );

    // Create AI SDK tools
    const tools = createAgenticWriterTools(
      params.memoryLayer,
      params.basic,
      this.githubToken
    );

    const prompt = agenticWriterPrompt({
      basic: params.basic,
      analyzedFiles: params.basic.files.filter((f) => f.status === "done")
        .length,
    });

    try {
      const result = await generateText({
        model: this.models.agent,
        prompt,
        tools,
        temperature: 0.5,
        maxSteps: 150,
        maxRetries: 6,
      });

      console.log(
        `[LLM] AgenticWriter completed after ${
          result.steps?.length || 0
        } steps, finish reason: ${result.finishReason}`
      );

      // console.log(
      //   result.steps.map((s) => {
      //     return {
      //       type: s.stepType,
      //       toolCalls: s.toolCalls.length,
      //       toolResults: s.toolResults.length,
      //       text: s.text,
      //     };
      //   })
      // );
      // console.log(result.steps[result.steps.length - 1].response.body?.choices);

      // Extract the final text - this should be in YAML format
      const finalText = result.text;

      if (!finalText || finalText.trim().length === 0) {
        throw new Error("AgenticWriter returned empty output");
      }

      const parsedResult = parseMessageToYaml<{
        comprehensive_answer: string;
      }>(finalText);

      return {
        final_output: parsedResult.comprehensive_answer,
        parsedResult,
      };
    } catch (error) {
      console.error(`[LLM] AgenticWriter failed:`, error);

      // Provide more detailed error information
      if (error instanceof Error) {
        throw new Error(`AgenticWriter failed: ${error.message}`);
      } else {
        throw new Error(
          `AgenticWriter failed with unknown error: ${String(error)}`
        );
      }
    }
  }
}
