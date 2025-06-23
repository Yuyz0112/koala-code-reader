import { useState } from "react";
import { FileItem } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileListProps {
  files: FileItem[];
  onFilesChange: (files: FileItem[]) => void;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  status?: "pending" | "ignored" | "done";
  children: Map<string, TreeNode>;
  isExplicit: boolean; // Whether this node was explicitly in the files array
}

export function FileList({ files, onFilesChange }: FileListProps) {
  // Initialize with common directories expanded
  const getInitialExpanded = () => {
    const expanded = new Set<string>();
    const commonDirs = ["src", "lib", "components", "utils", "pages", "app"];

    files.forEach((file) => {
      const pathParts = file.path.split("/");
      if (pathParts.length > 1 && commonDirs.includes(pathParts[0])) {
        expanded.add(pathParts[0]);
      }
      // Also expand directories that are at root level
      if (pathParts.length === 1 && file.type === "directory") {
        expanded.add(file.path);
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

  const toggleFileStatus = (path: string) => {
    const updatedFiles = files.map((file) => {
      if (file.path === path) {
        return {
          ...file,
          status: (file.status === "pending"
            ? "ignored"
            : "pending") as FileItem["status"],
        };
      }
      return file;
    });
    onFilesChange(updatedFiles);
  };

  const toggleDirectoryStatus = (dirPath: string) => {
    // Find all files under this directory
    const filesInDir = files.filter(
      (file) => file.path.startsWith(dirPath + "/") || file.path === dirPath
    );

    // Check if all files in directory are pending
    const allPending = filesInDir.every((file) => file.status === "pending");
    const newStatus = allPending ? "ignored" : "pending";

    const updatedFiles = files.map((file) => {
      if (file.path.startsWith(dirPath + "/") || file.path === dirPath) {
        return {
          ...file,
          status: newStatus as FileItem["status"],
        };
      }
      return file;
    });
    onFilesChange(updatedFiles);
  };

  // Get directory status based on its children
  const getDirectoryStatus = (
    dirPath: string
  ): "pending" | "ignored" | "mixed" => {
    const filesInDir = files.filter((file) =>
      file.path.startsWith(dirPath + "/")
    );

    if (filesInDir.length === 0) return "pending";

    const pendingCount = filesInDir.filter(
      (file) => file.status === "pending"
    ).length;
    const ignoredCount = filesInDir.filter(
      (file) => file.status === "ignored"
    ).length;

    if (pendingCount === filesInDir.length) return "pending";
    if (ignoredCount === filesInDir.length) return "ignored";
    return "mixed";
  };

  const selectAll = () => {
    const updatedFiles = files.map((file) => ({
      ...file,
      status: "pending" as FileItem["status"],
    }));
    onFilesChange(updatedFiles);
  };

  const selectNone = () => {
    const updatedFiles = files.map((file) => ({
      ...file,
      status: "ignored" as FileItem["status"],
    }));
    onFilesChange(updatedFiles);
  };

  // Build tree structure
  const buildTree = (): TreeNode => {
    // Show all files, including ignored ones
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
        // Only show checkbox for explicitly tracked files/directories
        const isChecked = child.status === "pending";
        const displayName =
          child.type === "directory" ? `${child.name}/` : child.name;
        const typeIcon = child.type === "directory" ? "📁" : "📄";

        elements.push(
          <div
            key={child.path}
            className={`flex items-center py-1 hover:bg-gray-50 ${
              child.status === "ignored" ? "opacity-50" : ""
            }`}
            style={{ paddingLeft: `${indent}px` }}
          >
            {child.type === "directory" && hasChildren && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleExpanded(child.path)}
                className="mr-1 p-0.5 h-6 w-6 text-gray-500 hover:text-gray-700"
              >
                {isExpanded ? "▼" : "▶"}
              </Button>
            )}
            {(!hasChildren || child.type === "file") && (
              <span className="mr-1 w-6"></span>
            )}
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => {
                if (child.type === "directory") {
                  toggleDirectoryStatus(child.path);
                } else {
                  toggleFileStatus(child.path);
                }
              }}
              className="mr-2"
            />
            <span className="mr-2">{typeIcon}</span>
            <span
              className={`text-sm font-mono ${
                child.status === "ignored"
                  ? "text-gray-400 line-through"
                  : "text-gray-700"
              }`}
            >
              {displayName}
            </span>
          </div>
        );

        // Recursively render children if expanded
        if (hasChildren && (isExpanded || child.type === "file")) {
          elements.push(...renderNode(child, depth + 1));
        }
      } else {
        // For implicit directories (intermediate paths), show with checkbox for bulk operations
        const dirStatus = getDirectoryStatus(child.path);
        const isChecked = dirStatus === "pending";
        const isIndeterminate = dirStatus === "mixed";

        elements.push(
          <div
            key={child.path}
            className={`flex items-center py-1 hover:bg-gray-50 ${
              dirStatus === "ignored" ? "opacity-50" : ""
            }`}
            style={{ paddingLeft: `${indent}px` }}
          >
            {hasChildren && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggleExpanded(child.path)}
                className="mr-1 p-0.5 h-6 w-6 text-gray-500 hover:text-gray-700"
              >
                {isExpanded ? "▼" : "▶"}
              </Button>
            )}
            {!hasChildren && <span className="mr-1 w-6"></span>}
            <Checkbox
              checked={isIndeterminate ? "indeterminate" : isChecked}
              onCheckedChange={() => toggleDirectoryStatus(child.path)}
              className="mr-2"
            />
            <span className="mr-2">📁</span>
            <span
              className={`text-sm font-mono ${
                dirStatus === "ignored"
                  ? "text-gray-400 line-through"
                  : dirStatus === "mixed"
                  ? "text-amber-600"
                  : "text-gray-600"
              }`}
            >
              {child.name}/
            </span>
          </div>
        );

        // Recursively render children if expanded
        if (hasChildren && isExpanded) {
          elements.push(...renderNode(child, depth + 1));
        }
      }
    });

    return elements;
  };

  const tree = buildTree();

  if (!files || files.length === 0) {
    return <div className="text-gray-500 text-sm p-4">No files available</div>;
  }

  return (
    <div className="border rounded-md max-h-96">
      <div className="p-2 bg-gray-50 border-b">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Files</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800 h-6"
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectNone}
              className="text-xs text-blue-600 hover:text-blue-800 h-6"
            >
              Select None
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-xs text-gray-500">
            ✓ = Pending (will be analyzed), ✗ = Ignored, ▣ = Mixed (some files
            selected)
          </div>
          <div className="text-xs text-gray-500">
            {files.filter((f) => f.status === "pending").length} pending,{" "}
            {files.filter((f) => f.status === "ignored").length} ignored
          </div>
        </div>
      </div>
      <ScrollArea className="p-2 h-80">{renderNode(tree)}</ScrollArea>
    </div>
  );
}
