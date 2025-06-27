import { useState, useEffect, lazy, Suspense } from "react";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, FileText, AlertCircle } from "lucide-react";
import { parseGitHubUrl } from "@/lib/utils";

import "./shiki.css";

// Lazy load ShikiHighlighter
const ShikiHighlighter = lazy(() =>
  import("react-shiki").then((module) => ({ default: module.default }))
);

// Map file extensions to Shiki language identifiers
const getLanguageFromExtension = (extension: string): string => {
  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    cs: "csharp",
    rb: "ruby",
    kt: "kotlin",
    hs: "haskell",
    clj: "clojure",
    ml: "ocaml",
    fs: "fsharp",
    sh: "bash",
    ps1: "powershell",
    md: "markdown",
    yml: "yaml",
    txt: "text",
  };

  return languageMap[extension] || extension;
};

interface FileViewerProps {
  filePath: string | null;
  githubUrl?: string;
  githubRef?: string;
}

export function FileViewer({
  filePath,
  githubUrl,
  githubRef = "main",
}: FileViewerProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFileContent = async () => {
    if (!filePath || !githubUrl) {
      setContent("");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse GitHub URL
      const repoInfo = parseGitHubUrl(githubUrl);
      if (!repoInfo) {
        throw new Error("Invalid GitHub URL format");
      }

      const { owner, repo } = repoInfo;

      const fileData = await apiClient.readFileFromGitHub(
        owner,
        repo,
        filePath,
        githubRef
      );

      setContent(fileData.content);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load file";
      setError(errorMessage);
      console.error("Error loading file:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFileContent();
  }, [filePath, githubUrl, githubRef]);

  if (!filePath) {
    return (
      <div className="p-6 bg-white rounded-lg border h-full">
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p>Current file content will appear here.</p>
          <p className="text-sm">Select a file to view its content.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg border h-full">
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-500">Loading file content...</p>
          <p className="text-sm text-gray-400 mt-1">{filePath}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white rounded-lg border h-full">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-600 mb-2">Failed to load file</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <Button variant="outline" onClick={loadFileContent}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Get file extension for syntax highlighting class
  const getFileExtension = (path: string) => {
    const parts = path.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  };

  const extension = getFileExtension(filePath);
  const language = getLanguageFromExtension(extension);

  return (
    <div className="bg-white rounded-lg border h-full flex flex-col">
      {/* File header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
          <span
            className="font-mono text-sm text-gray-700 truncate"
            title={filePath}
          >
            {filePath}
          </span>
        </div>
      </div>

      {/* File content */}
      <ScrollArea className="flex-1">
        <div>
          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading syntax highlighter...</span>
              </div>
            }
          >
            <ShikiHighlighter
              language={language}
              theme="github-light-default"
              className="text-sm p-0"
              showLineNumbers
            >
              {content}
            </ShikiHighlighter>
          </Suspense>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* File info footer */}
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-500 flex justify-between">
        <span>{content.split("\n").length} lines</span>
      </div>
    </div>
  );
}
