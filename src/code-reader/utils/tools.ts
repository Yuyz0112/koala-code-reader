import { MemoryLayer } from "./memory-layer";
import { generateFileStructureWithStatus, SharedStorage } from "./storage";
import { tool } from "ai";
import { z } from "zod";
import {
  readFromGithubWithEnv,
  searchFilesInGithubWithEnv,
  SearchOptions,
  FileSearchResult,
} from "./fs";

export function createAgenticWriterTools(
  memoryLayer: MemoryLayer,
  basic: SharedStorage["basic"],
  env?: any
) {
  return {
    get_memory_understanding: tool({
      description:
        "Get the understanding/analysis for a specific file from memory",
      parameters: z.object({
        filePath: z
          .string()
          .describe("The path of the file to get understanding for"),
      }),
      execute: async ({ filePath }) => {
        // For AgenticWriter, we want to get the stored understanding directly
        // We'll use the files list to get the understanding since it's already stored there
        const file = basic.files.find((f) => f.path === filePath);
        return {
          filePath,
          understanding: file?.understanding || null,
          hasUnderstanding: !!file?.understanding,
        };
      },
    }),

    list_analyzed_files: tool({
      description:
        "Get a list of all files that have been analyzed and stored in memory",
      parameters: z.object({}),
      execute: async () => {
        const analyzedFiles = basic.files
          .filter(
            (file) =>
              file.status === "done" &&
              file.understanding &&
              file.type === "file"
          )
          .map((file) => ({
            path: file.path,
          }));

        return analyzedFiles;
      },
    }),

    get_file_structure: tool({
      description:
        "Get the project structure and file organization information",
      parameters: z.object({}),
      execute: async () => {
        return generateFileStructureWithStatus(basic.files);
      },
    }),

    semantic_search_memory: tool({
      description:
        "Perform semantic search in memory layer to find relevant file understandings based on a query. Use this to find files and their analysis that are semantically related to your current task or question.",
      parameters: z.object({
        query: z
          .string()
          .describe(
            "The search query to find semantically similar content. This should describe what you're looking for in natural language."
          ),
        maxResults: z
          .number()
          .optional()
          .default(5)
          .describe("Maximum number of results to return (default: 5)"),
        minScore: z
          .number()
          .optional()
          .default(0.1)
          .describe(
            "Minimum similarity score threshold (0.0-1.0, default: 0.1). Higher values return more similar results."
          ),
        excludeFile: z
          .string()
          .optional()
          .describe("File path to exclude from search results"),
      }),
      execute: async ({
        query,
        maxResults = 5,
        minScore = 0.1,
        excludeFile,
      }) => {
        try {
          // Use the new search method from MemoryLayer
          const searchResults = await memoryLayer.search(query, {
            maxResults,
            minScore,
            excludeFile,
          });

          // Filter to only include files that exist in current storage
          const filteredResults = searchResults.filter((result) => {
            const fileExists = basic.files.some(
              (f) => f.path === result.filePath
            );
            return fileExists;
          });

          return filteredResults;
        } catch (error) {
          console.error("[semantic_search_memory] Search failed:", error);
          return {
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          };
        }
      },
    }),

    get_file_content: tool({
      description:
        "Get the raw content of a specific file. MANDATORY: Use this when you need concrete code examples, specific implementation details, or when existing understanding lacks technical specifics. This is REQUIRED for quality analysis - don't rely only on memory summaries.",
      parameters: z.object({
        filePath: z
          .string()
          .describe("The path of the file to retrieve content for"),
      }),
      execute: async ({ filePath }) => {
        try {
          // Find the file in storage to get metadata
          const file = basic.files.find((f) => f.path === filePath);

          if (!file) {
            return {
              success: false,
              error: "File not found in project",
              filePath,
              content: null,
            };
          }

          if (!basic.githubUrl) {
            return {
              success: false,
              error: "GitHub URL not configured for this project",
              filePath,
              content: null,
            };
          }

          // Read the file content from GitHub
          const content = await readFromGithubWithEnv(
            basic.githubUrl || "",
            filePath,
            basic.githubRef || "main",
            env
          );

          return {
            success: true,
            filePath,
            content,
            fileType: file.type,
            hasExistingUnderstanding: !!file.understanding,
            existingUnderstanding: file.understanding || null,
          };
        } catch (error) {
          console.error(
            `[get_file_content] Failed to read file ${filePath}:`,
            error
          );
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
            filePath,
            content: null,
          };
        }
      },
    }),

    phase_control: tool({
      description:
        "Control the analysis phase flow based on insights and knowledge gaps. CRITICAL: When action='continue_next_phase', do NOT output text after this tool call - immediately continue with next phase tools. MANDATORY: You cannot proceed without concrete code examples and technical evidence.",
      parameters: z.object({
        action: z
          .enum(["continue_current_phase", "continue_next_phase", "complete"])
          .describe(
            "continue_current_phase: stay in current phase to address gaps, continue_next_phase: proceed to next phase (NO text output after), complete: finish analysis and output final documentation"
          ),
        phase: z.string().describe("Current phase name"),
        key_insights: z
          .array(z.string())
          .describe(
            "Phase-specific insights: P1=investigation scope & strategy, P2=technical findings from code, P3=answer structure & validation"
          ),
        knowledge_gaps: z
          .array(z.string())
          .describe(
            "What important aspects still need exploration, use empty array if none"
          ),
        next_focus: z
          .string()
          .optional()
          .describe("Specific area to focus on next if continuing"),
      }),
      execute: async (params) => {
        // Check if there are knowledge gaps
        if (params.knowledge_gaps && params.knowledge_gaps.length > 0) {
          return {
            action: "continue_current_phase",
            message: `MANDATORY: Must address knowledge gaps: ${params.knowledge_gaps.join(
              ", "
            )}`,
            suggestion: "Address these gaps before proceeding to next phase",
            instruction:
              "Continue investigation to resolve all knowledge gaps. You CANNOT proceed until these are resolved.",
            knowledge_gaps: params.knowledge_gaps,
            phase: params.phase,
          };
        }

        // Check if there are sufficient insights
        if (!params.key_insights || params.key_insights.length < 3) {
          return {
            action: "continue_current_phase",
            message:
              "MANDATORY: Insufficient insights gathered. Need substantial findings with concrete evidence.",
            suggestion:
              "Focus on finding concrete evidence, specific code examples, and detailed implementation patterns",
            instruction:
              "Continue investigation to build meaningful insights. You MUST have concrete code examples.",
            phase: params.phase,
          };
        }

        if (params.action === "continue_current_phase") {
          return {
            action: "continue_current_phase",
            message: "Continue investigating in current phase as requested.",
            phase: params.phase,
            insights_count: params.key_insights.length,
            instruction: "Continue investigation with additional tool calls.",
            next_focus: params.next_focus,
          };
        }

        if (params.action === "continue_next_phase") {
          return {
            action: "continue_next_phase",
            phase: params.phase,
            insights_count: params.key_insights.length,
            ready_to_proceed: true,
            instruction: "Immediately proceed to next phase tool calls.",
            next_focus: params.next_focus,
          };
        }

        return {
          action: "complete",
          phase: params.phase,
          insights_count: params.key_insights.length,
          ready_to_proceed: true,
          instruction: "Now output the final YAML documentation.",
        };
      },
    }),

    search_files_in_repository: tool({
      description:
        "Search for files in the GitHub repository by filename, path, or content. This tool helps find relevant files based on search criteria, which is useful for understanding project structure, finding specific implementations, or locating files related to a particular feature or technology.",
      parameters: z.object({
        query: z
          .string()
          .describe(
            "Search query - can be a filename, partial path, or text to search for. Examples: 'config', 'test', 'package.json', 'authentication'"
          ),
        extension: z
          .string()
          .optional()
          .describe(
            "Filter by file extension (e.g., '.ts', '.js', '.md', '.json'). Leave empty to search all file types."
          ),
        searchInContent: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Whether to search within file contents (true) or just filenames/paths (false). Content search is more thorough but slower."
          ),
        includeContent: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Whether to include the actual file content in results. Set to true when you need to see the code or content of matching files."
          ),
        maxResults: z
          .number()
          .optional()
          .default(10)
          .describe(
            "Maximum number of results to return (1-50). Lower numbers for quick overview, higher for comprehensive search."
          ),
      }),
      execute: async ({
        query,
        extension,
        searchInContent = false,
        includeContent = false,
        maxResults = 10,
      }) => {
        try {
          // Validate maxResults range
          const limitedMaxResults = Math.min(Math.max(maxResults, 1), 50);

          // Check if GitHub URL is configured
          if (!basic.githubUrl) {
            return {
              success: false,
              error: "GitHub URL not configured for this project",
              query,
              results: [],
            };
          }

          // Prepare search options
          const searchOptions: SearchOptions = {
            extension,
            maxResults: limitedMaxResults,
            includeContent,
            searchInContent,
          };

          // Perform the search
          const searchResults = await searchFilesInGithubWithEnv(
            basic.githubUrl,
            query,
            searchOptions,
            basic.githubRef || "main",
            env
          );

          // Return results with metadata
          return {
            success: true,
            query,
            searchOptions: {
              extension: extension || "all types",
              searchInContent,
              includeContent,
              maxResults: limitedMaxResults,
              ref: basic.githubRef || "main",
            },
            resultCount: searchResults.length,
            results: searchResults.map((result: FileSearchResult) => ({
              path: result.path,
              name: result.name,
              type: result.type,
              size: result.size,
              score: result.score,
              content: result.content,
              // Add some helpful context
              directory: result.path.includes("/")
                ? result.path.substring(0, result.path.lastIndexOf("/"))
                : "root",
              hasExistingAnalysis: basic.files.some(
                (f) => f.path === result.path && f.understanding
              ),
            })),
          };
        } catch (error) {
          console.error("[search_files_in_repository] Search failed:", error);
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
            query,
            results: [],
          };
        }
      },
    }),

    thinking: tool({
      description:
        "Express your reasoning, analysis, and thought process. Use this to explain what you're thinking, planning, or discovering.",
      parameters: z.object({
        thought: z
          .string()
          .describe("Your current thoughts, reasoning, or analysis"),
      }),

      execute: async ({ thought }) => {
        console.log(`[THINKING] ${thought}`);
        return {
          acknowledged: true,
          message: "Thinking recorded.",
        };
      },
    }),
  };
}
