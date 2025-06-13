export type FileStatus = "pending" | "ignored" | "done";

export type FileItem = {
  path: string;
  status: FileStatus;
  type: "file" | "directory";
  summary?: string; // Analysis understanding for analyzed files
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
  };

  currentFile?: {
    name: string;
    analysis?: {
      summary: string;
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
        action: "refined";
        userSummary: string;
        reason?: string;
      };

  summariesBuffer: Array<{
    filename: string;
    summary: string;
  }>;

  reducedOutput: string;

  completed: boolean;

  // Call to action for UI to determine what user interaction is needed
  // Only set by compute nodes, cleared by FlowManager
  callToAction?: "improve_basic_input" | "user_feedback" | "finish" | null;

  // Heartbeat mechanism for flow execution lock
  // Updated every 10 seconds during flow execution to prevent duplicate handlers
  lastHeartbeat?: number; // Unix timestamp in milliseconds
};

export function generateFileStructureWithStatus(files: FileItem[]): string {
  if (!files || files.length === 0) {
    return "No files available";
  }

  // Filter out ignored files
  const visibleFiles = files.filter((file) => file.status !== "ignored");

  if (visibleFiles.length === 0) {
    return "No visible files available";
  }

  // Build a proper tree structure from flat file paths
  interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    status?: FileStatus;
    children: Map<string, TreeNode>;
    isExplicit: boolean; // Whether this node was explicitly in the files array
  }

  const root: TreeNode = {
    name: "",
    path: "",
    type: "directory",
    children: new Map(),
    isExplicit: false,
  };

  // Build tree structure
  visibleFiles.forEach((file) => {
    const pathParts = file.path.split("/").filter((part) => part !== "");
    let currentNode = root;

    // Create intermediate directories if they don't exist
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const currentPath = pathParts.slice(0, i + 1).join("/");

      if (!currentNode.children.has(part)) {
        const isLastPart = i === pathParts.length - 1;
        currentNode.children.set(part, {
          name: part,
          path: currentPath,
          type: isLastPart ? file.type : "directory",
          status: isLastPart ? file.status : "pending",
          children: new Map(),
          isExplicit: isLastPart,
        });
      }

      currentNode = currentNode.children.get(part)!;

      // Update if this is the actual file/directory from the array
      if (i === pathParts.length - 1) {
        currentNode.type = file.type;
        currentNode.status = file.status;
        currentNode.isExplicit = true;
      }
    }
  });

  // Generate tree display
  function renderNode(node: TreeNode, depth: number = 0): string[] {
    const lines: string[] = [];

    // Sort children: directories first, then files, both alphabetically
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    sortedChildren.forEach((child) => {
      const indent = "  ".repeat(depth);
      const typeIcon = child.type === "directory" ? "📁" : "📄";

      if (child.isExplicit) {
        // Only show checkbox for explicitly tracked files/directories
        const checkbox = child.status === "done" ? "- [x]" : "- [ ]";
        const displayName =
          child.type === "directory" ? `${child.name}/` : child.name;
        lines.push(`${indent}${checkbox} ${typeIcon} ${displayName}`);
      } else {
        // For implicit directories (intermediate paths), show without checkbox
        lines.push(`${indent}📁 ${child.name}/`);
      }

      // Recursively render children
      if (child.children.size > 0) {
        lines.push(...renderNode(child, depth + 1));
      }
    });

    return lines;
  }

  const result = renderNode(root);
  return result.join("\n");
}

// Helper function to extract analyzed summaries from files
export function getAnalyzedSummaries(files: FileItem[]): Array<{
  filename: string;
  summary: string;
}> {
  return files
    .filter((file) => file.status === "done" && file.summary)
    .map((file) => ({
      filename: file.path,
      summary: file.summary!,
    }));
}
