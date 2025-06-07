import { parse as parseYaml } from "yaml";
import {
  getEntryFilePrompt,
  analyzeFilePrompt,
  reduceHistoryPrompt,
} from "./prompts";
import { SharedStorage } from "./storage";
import { generateText } from "ai";

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

export class LLM {
  models: SharedStorage["__ctx"]["models"];

  constructor(models: SharedStorage["__ctx"]["models"]) {
    this.models = models;
  }

  async getEntryFile(params: Pick<SharedStorage, "basic">) {
    const prompt = getEntryFilePrompt(params);

    const { text } = await generateText({
      model: this.models.default,
      prompt,
    });

    return parseMessageToYaml<{
      decision: "entry_file_found" | "need_more_info";
      next_file?: {
        name: string;
        reason: string;
      };
      ask_user?: string;
    }>(text);
  }

  async analyzeFile(
    params: Pick<
      SharedStorage,
      "basic" | "nextFile" | "currentFile" | "userFeedback" | "allSummaries"
    >,
    toAnalyzeContent: string
  ) {
    const prompt = analyzeFilePrompt(params, toAnalyzeContent);

    const { text } = await generateText({
      model: this.models.default,
      prompt,
    });

    return parseMessageToYaml<
      | {
          current_analysis: {
            filename: string;
            summary: string;
          };
          next_focus_proposal: {
            next_filename: string;
            reason: string;
          };
        }
      | {
          analysis_complete: true;
          final_summary: string;
        }
    >(text);
  }

  async reduceHistory(
    params: Pick<
      SharedStorage,
      | "basic"
      | "allSummaries"
      | "reducedOutput"
      | "summariesBuffer"
      | "userFeedback"
    >
  ) {
    const prompt = reduceHistoryPrompt(params);

    const { text } = await generateText({
      model: this.models.default,
      prompt,
    });

    return parseMessageToYaml<{
      reduced_output: string;
    }>(text);
  }
}
