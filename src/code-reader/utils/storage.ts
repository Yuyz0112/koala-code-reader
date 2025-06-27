export type FileStatus = "pending" | "ignored" | "done";

export type FileItem = {
  path: string;
  status: FileStatus;
  type: "file" | "directory";
  understanding?: string; // Analysis understanding for analyzed files
};

export type SharedStorage = {
  basic: {
    repoName: string;
    mainGoal: string;
    specificAreas?: string;
    files: FileItem[]; // Array of files with status
    githubUrl?: string; // GitHub repository URL for file reading
    githubRef?: string; // GitHub branch/tag/reference for file reading

    askUser?: string; // If current input is insufficient to get entry files, ask user for more information
    previousWrongPath?: string; // If the LLM selected a wrong path, store it here
  };

  currentFile?: {
    name: string;
    analysis?: {
      understanding: string;
    };
  };

  nextFile?: {
    name: string;
    reason: string;
  };

  userFeedback?:
    | {
        action: "accept";
        reason?: string;
      }
    | {
        action: "reject";
        reason: string;
      }
    | {
        action: "refine";
        userUnderstanding: string;
        reason?: string;
      }
    | {
        action: "finish";
      };

  reducedOutput: string;

  completed: boolean;

  // Call to action for UI to determine what user interaction is needed
  // Only set by compute nodes, cleared by FlowManager
  callToAction?: "improve_basic_input" | "user_feedback" | "finish" | null;

  // Heartbeat mechanism for flow execution lock
  // Updated every 10 seconds during flow execution to prevent duplicate handlers
  lastHeartbeat?: number; // Unix timestamp in milliseconds
};

// Helper function to extract analyzed understandings from files
export function getAnalyzedUnderstandings(files: FileItem[]): Array<{
  filename: string;
  understanding: string;
}> {
  return files
    .filter((file) => file.status === "done" && file.understanding)
    .map((file) => ({
      filename: file.path,
      understanding: file.understanding!,
    }));
}

export function generateFileStructureWithStatus(files: FileItem[]): string {
  if (!files || files.length === 0) {
    return "No files available";
  }

  // Filter out ignored files
  const visibleFiles = files.filter((file) => file.status !== "ignored");

  if (visibleFiles.length === 0) {
    return "No visible files available";
  }

  // Sort files: directories first, then files, both alphabetically
  const sortedFiles = visibleFiles.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.path.localeCompare(b.path);
  });

  const lines: string[] = [];

  // Add header
  lines.push("Available Files and Directories:");
  lines.push("");

  // Generate simple list with clear status indicators
  sortedFiles.forEach((file) => {
    let statusIndicator: string;
    let statusText: string;

    switch (file.status) {
      case "done":
        statusIndicator = "✓";
        statusText = "ANALYZED";
        break;
      case "pending":
        statusIndicator = "○";
        statusText = "PENDING";
        break;
      case "ignored":
        statusIndicator = "×";
        statusText = "IGNORED";
        break;
      default:
        statusIndicator = "?";
        statusText = "UNKNOWN";
    }

    const typeIndicator = file.type === "directory" ? "[DIR]" : "[FILE]";
    const path = file.path;

    lines.push(`${statusIndicator} ${typeIndicator} ${path} (${statusText})`);
  });

  lines.push("");
  lines.push("Legend:");
  lines.push("✓ = Already analyzed");
  lines.push("○ = Available for analysis");
  lines.push("[DIR] = Directory");
  lines.push("[FILE] = File");

  return lines.join("\n");
}
