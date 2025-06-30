import { useState } from "react";
import { FileItem, HistoryEntry } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  History,
  Clock,
  MessageSquare,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";

interface FileUnderstandingListProps {
  files: FileItem[];
  history?: HistoryEntry[]; // Global history from backend
  onFileSelect?: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  status?: "pending" | "ignored" | "done";
  understanding?: string;
  children: Map<string, TreeNode>;
  isExplicit: boolean;
}

export function FileUnderstandingList({
  files,
  history = [], // Default to empty array for fallback
  onFileSelect,
}: FileUnderstandingListProps) {
  // Initialize with directories expanded if they contain any files
  const getInitialExpanded = () => {
    const expanded = new Set<string>();
    const commonDirs = ["src", "lib", "components", "utils", "pages", "app"];

    files.forEach((file) => {
      const pathParts = file.path.split("/");
      // Expand common directories and directories with analyzed files
      if (
        pathParts.length > 1 &&
        (commonDirs.includes(pathParts[0]) || file.understanding)
      ) {
        for (let i = 1; i < pathParts.length; i++) {
          const dirPath = pathParts.slice(0, i).join("/");
          if (dirPath) {
            expanded.add(dirPath);
          }
        }
      }
    });

    return expanded;
  };

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() =>
    getInitialExpanded()
  );

  const toggleExpanded = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  // Build tree structure - include all files
  const buildTree = (): TreeNode => {
    // Show all files, not just those with summaries
    const allFiles = files;

    const root: TreeNode = {
      name: "",
      path: "",
      type: "directory",
      children: new Map(),
      isExplicit: false,
    };

    // Build tree structure
    allFiles.forEach((file) => {
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
            understanding: isLastPart ? file.understanding : undefined,
            children: new Map(),
            isExplicit: isLastPart,
          });
        }

        currentNode = currentNode.children.get(part)!;

        // Update if this is the actual file from the array
        if (i === pathParts.length - 1) {
          currentNode.type = file.type;
          currentNode.status = file.status;
          currentNode.understanding = file.understanding;
          currentNode.isExplicit = true;
        }
      }
    });

    return root;
  };

  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element[] => {
    const elements: JSX.Element[] = [];

    // Sort children: directories first, then files, both alphabetically
    const sortedChildren = Array.from(node.children.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    sortedChildren.forEach((child) => {
      const isExpanded = expandedNodes.has(child.path);
      const hasChildren = child.children.size > 0;
      const indent = depth * 20; // 20px per level

      if (child.isExplicit) {
        // This is an actual file with understanding
        elements.push(
          <div key={child.path} className="mb-4">
            <div
              className={`flex items-center py-2 px-3 hover:bg-gray-50 cursor-pointer rounded-md border ${
                child.type === "file" ? "bg-white" : "bg-gray-50"
              }`}
              style={{ paddingLeft: `${indent + 12}px` }}
              onClick={() => onFileSelect?.(child.path)}
            >
              {child.type === "directory" && hasChildren && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(child.path);
                  }}
                  className="mr-2 p-0.5 h-6 w-6 text-gray-500 hover:text-gray-700"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              )}
              {(!hasChildren || child.type === "file") && (
                <span className="mr-2 w-6"></span>
              )}

              {child.type === "directory" ? (
                <Folder className="h-4 w-4 mr-2 text-blue-500" />
              ) : (
                <FileText className="h-4 w-4 mr-2 text-green-500" />
              )}

              <span
                className={`text-sm font-mono font-medium ${
                  child.status === "ignored"
                    ? "text-gray-400 line-through"
                    : child.status === "done"
                    ? "text-gray-700"
                    : "text-gray-600"
                }`}
              >
                {child.type === "directory" ? `${child.name}/` : child.name}
              </span>

              {child.type === "file" && (
                <>
                  {child.status === "done" && child.understanding && (
                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      ✓ Analyzed
                    </span>
                  )}
                  {child.status === "pending" && (
                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      ⏳ Pending
                    </span>
                  )}
                  {child.status === "ignored" && (
                    <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      ⚫ Ignored
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Show understanding only for analyzed files */}
            {child.type === "file" &&
              child.status === "done" &&
              child.understanding && (
                <Card className="ml-6 mt-2 border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <Markdown className="text-sm text-gray-600">
                      {child.understanding}
                    </Markdown>
                  </CardContent>
                </Card>
              )}
          </div>
        );
      } else {
        // This is an intermediate directory
        elements.push(
          <div
            key={child.path}
            className="flex items-center py-1 px-2 hover:bg-gray-50 rounded-md"
            style={{ paddingLeft: `${indent + 12}px` }}
          >
            {hasChildren && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleExpanded(child.path)}
                className="mr-2 p-0.5 h-6 w-6 text-gray-500 hover:text-gray-700"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            {!hasChildren && <span className="mr-2 w-6"></span>}
            <Folder className="h-4 w-4 mr-2 text-gray-400" />
            <span className="text-sm font-mono text-gray-500">
              {child.name}/
            </span>
          </div>
        );
      }

      // Recursively render children if expanded
      if (hasChildren && (isExpanded || child.type === "file")) {
        elements.push(...renderNode(child, depth + 1));
      }
    });

    return elements;
  };

  const tree = buildTree();
  const filesWithUnderstandings = files.filter((file) => file.understanding);
  const pendingFiles = files.filter((file) => file.status === "pending");
  const ignoredFiles = files.filter((file) => file.status === "ignored");

  // Render history list view
  const renderHistoryView = () => {
    // Use global history array from backend, sort by timestamp (newest first)
    const sortedHistory = [...history].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    if (sortedHistory.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>No analyzed files yet.</p>
          <p className="text-sm">
            Files will appear here as they are analyzed.
          </p>
        </div>
      );
    }

    const formatTimestamp = (timestamp: number) => {
      return new Date(timestamp).toLocaleString();
    };

    return (
      <div className="space-y-4">
        {sortedHistory.map((historyEntry, index) => {
          // Find the corresponding file to get its understanding
          const file = files.find((f) => f.path === historyEntry.filePath);

          return (
            <div
              key={`${historyEntry.filePath}-${historyEntry.timestamp}`}
              className="mb-4"
            >
              <div
                className="flex items-center py-2 px-3 hover:bg-gray-50 cursor-pointer rounded-md border bg-white"
                onClick={() => onFileSelect?.(historyEntry.filePath)}
              >
                <span className="mr-3 text-xs text-gray-400 font-mono w-6 text-center">
                  {index + 1}
                </span>
                <FileText className="h-4 w-4 mr-2 text-green-500" />
                <span className="text-sm font-mono font-medium text-gray-700 flex-1">
                  {historyEntry.filePath}
                </span>

                {/* Timestamp */}
                <div className="ml-2 flex items-center text-xs text-gray-500">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimestamp(historyEntry.timestamp)}
                </div>
              </div>

              {/* Show file understanding if available */}
              {file?.understanding && (
                <Card className="ml-9 mt-2 border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <Markdown className="text-sm text-gray-600">
                      {file.understanding}
                    </Markdown>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>No files available.</p>
        <p className="text-sm">
          Files will appear here once repository is loaded.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-md h-full flex flex-col">
      <div className="p-3 bg-gray-50 border-b">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            File Understandings
          </span>
          <div className="text-xs text-gray-500 text-right">
            <div>
              {filesWithUnderstandings.length} analyzed, {pendingFiles.length}{" "}
              pending, {ignoredFiles.length} ignored
            </div>
            <div className="mt-0.5">
              {files.length} total file{files.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Click on a file to view its content in the Current File tab
        </div>
      </div>

      <Tabs
        defaultValue="tree"
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tree" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            File Tree
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="flex-1 mt-2 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 p-3">{renderNode(tree)}</div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-2 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">{renderHistoryView()}</div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
