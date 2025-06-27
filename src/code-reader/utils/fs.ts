import { SharedStorage } from "./storage";

// GitHub API response type for file contents
interface GitHubFileContent {
  type: string;
  encoding: string;
  content: string;
  sha: string;
  size: number;
  name: string;
  path: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string;
}

// GitHub API response types for search
export interface GitHubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: {
      login: string;
      avatar_url: string;
    };
  };
  score: number;
}

// GitHub tree API response types
export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// Search options for file system search
export interface SearchOptions {
  extension?: string; // File extension filter (e.g., ".ts", ".js")
  maxResults?: number; // Maximum number of results to return
  includeContent?: boolean; // Whether to include file content in results
  searchInContent?: boolean; // Whether to search in file content
}

// Search result type
export interface FileSearchResult {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  content?: string;
  sha: string;
  url: string;
  score?: number;
}

export async function readFile(path: string): Promise<string> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    throw error;
  }
}

export async function readFromGithub(
  repoUrl: string,
  filePath: string,
  ref: string = "main",
  githubToken: string
): Promise<string> {
  try {
    // Parse and clean the GitHub URL to remove search parameters
    let cleanUrl: string;
    try {
      const url = new URL(repoUrl);
      cleanUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      // If URL parsing fails, treat as a plain string (fallback for relative URLs)
      cleanUrl = repoUrl;
    }

    // Parse GitHub repository URL
    const repoMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      throw new Error("Invalid GitHub repository URL");
    }

    const [, owner, repo] = repoMatch;

    // Remove leading slash from file path
    const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;

    // Use GitHub Contents API
    let apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
    if (ref && ref !== "main") {
      apiUrl += `?ref=${encodeURIComponent(ref)}`;
    }

    // Prepare headers with optional GitHub token
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Koala-Code-Reader",
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(apiUrl, { headers });

    if (response.ok) {
      const data = (await response.json()) as GitHubFileContent;

      // Check if it's a file (not a directory)
      if (data.type !== "file") {
        throw new Error(`Path ${cleanPath} is not a file`);
      }

      // GitHub API returns base64 encoded content
      if (data.encoding === "base64") {
        // Use atob in browser environment, Buffer in Node.js environment
        let content: string;
        try {
          content = atob(data.content.replace(/\s/g, ""));
        } catch (e) {
          // If atob is not available, try using Buffer (Node.js environment)
          content = Buffer.from(data.content, "base64").toString("utf-8");
        }
        return content;
      } else {
        throw new Error(`Unsupported encoding: ${data.encoding}`);
      }
    } else if (response.status === 404) {
      throw new Error(`File not found: ${cleanPath} (ref: ${ref})`);
    } else {
      throw new Error(
        `Failed to fetch file from GitHub API: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.error("Error reading from GitHub API:", error);
    throw error;
  }
}

// Smart file reader: automatically select reading source using configuration from SharedStorage
export async function readFileFromStorage(
  filePath: string,
  storage: { basic: SharedStorage["basic"] },
  githubToken: string
): Promise<string> {
  const githubUrl = storage.basic.githubUrl;
  const githubRef = storage.basic.githubRef || "main";

  // If GitHub URL is available, read from GitHub first
  if (githubUrl) {
    return await readFromGithub(githubUrl, filePath, githubRef, githubToken);
  } else {
    // Read directly from local when no GitHub URL is available
    return await readFile(filePath);
  }
}

/**
 * Search files in a GitHub repository using GitHub API
 * @param repoUrl GitHub repository URL
 * @param query Search query (filename or content)
 * @param options Search options
 * @param ref Git reference (branch/tag/commit)
 * @param githubToken Optional GitHub token for authentication
 * @returns Array of search results
 */
export async function searchFilesInGithub(
  repoUrl: string,
  query: string,
  options: SearchOptions = {},
  ref: string = "main",
  githubToken: string
): Promise<FileSearchResult[]> {
  try {
    // Parse and clean the GitHub URL
    let cleanUrl: string;
    try {
      const url = new URL(repoUrl);
      cleanUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      cleanUrl = repoUrl;
    }

    // Parse GitHub repository URL
    const repoMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      throw new Error("Invalid GitHub repository URL");
    }

    const [, owner, repo] = repoMatch;
    const {
      extension,
      maxResults = 100,
      includeContent = false,
      searchInContent = false,
    } = options;

    // If searching in content, use GitHub search API
    if (searchInContent) {
      return await searchInFileContent(
        owner,
        repo,
        query,
        options,
        githubToken
      );
    }

    // Otherwise, get repository tree and filter locally
    return await searchInFileNames(
      owner,
      repo,
      query,
      ref,
      options,
      githubToken
    );
  } catch (error) {
    console.error("Error searching files in GitHub:", error);
    throw error;
  }
}

/**
 * Search files by filename in repository tree
 */
async function searchInFileNames(
  owner: string,
  repo: string,
  query: string,
  ref: string,
  options: SearchOptions,
  githubToken: string
): Promise<FileSearchResult[]> {
  const { extension, maxResults = 100, includeContent = false } = options;

  // Get repository tree
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;

  // Prepare headers with optional GitHub token
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Koala-Code-Reader",
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch repository tree: ${response.status} ${response.statusText}`
    );
  }

  const treeData = (await response.json()) as GitHubTreeResponse;
  const results: FileSearchResult[] = [];

  // Filter files based on query and options
  for (const item of treeData.tree) {
    if (item.type !== "blob") continue; // Only include files, not directories

    // Filter by extension if specified
    if (extension && !item.path.endsWith(extension)) continue;

    // Check if filename matches query (case-insensitive)
    const filename = item.path.split("/").pop() || "";
    const pathLower = item.path.toLowerCase();
    const queryLower = query.toLowerCase();

    if (
      !pathLower.includes(queryLower) &&
      !filename.toLowerCase().includes(queryLower)
    ) {
      continue;
    }

    // Create result object
    const result: FileSearchResult = {
      path: item.path,
      name: filename,
      type: "file",
      size: item.size,
      sha: item.sha,
      url: item.url,
      score: calculateScore(item.path, filename, query),
    };

    // Include content if requested
    if (includeContent) {
      try {
        result.content = await readFromGithub(
          `https://github.com/${owner}/${repo}`,
          item.path,
          ref,
          githubToken
        );
      } catch (error) {
        console.warn(`Failed to read content for ${item.path}:`, error);
      }
    }

    results.push(result);

    // Limit results
    if (results.length >= maxResults) break;
  }

  // Sort by score (higher is better)
  return results.sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Search files by content using GitHub Search API
 */
async function searchInFileContent(
  owner: string,
  repo: string,
  query: string,
  options: SearchOptions,
  githubToken: string
): Promise<FileSearchResult[]> {
  const { extension, maxResults = 100, includeContent = false } = options;

  // Build search query for GitHub API
  let searchQuery = `${query} repo:${owner}/${repo}`;
  if (extension) {
    searchQuery += ` extension:${extension.replace(".", "")}`;
  }

  const apiUrl = `https://api.github.com/search/code?q=${encodeURIComponent(
    searchQuery
  )}&per_page=${Math.min(maxResults, 100)}`;

  // Prepare headers with optional GitHub token
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Koala-Code-Reader",
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetch(apiUrl, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to search in file content: ${response.status} ${response.statusText}`
    );
  }

  const searchData = (await response.json()) as GitHubSearchResult;
  const results: FileSearchResult[] = [];

  for (const item of searchData.items) {
    const filename = item.path.split("/").pop() || "";

    const result: FileSearchResult = {
      path: item.path,
      name: filename,
      type: "file",
      sha: item.sha,
      url: item.url,
      score: item.score,
    };

    // Include content if requested
    if (includeContent) {
      try {
        result.content = await readFromGithub(
          `https://github.com/${owner}/${repo}`,
          item.path,
          "main",
          githubToken
        );
      } catch (error) {
        console.warn(`Failed to read content for ${item.path}:`, error);
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Calculate relevance score for search results
 */
function calculateScore(path: string, filename: string, query: string): number {
  const queryLower = query.toLowerCase();
  const filenameLower = filename.toLowerCase();
  const pathLower = path.toLowerCase();

  let score = 0;

  // Exact filename match gets highest score
  if (filenameLower === queryLower) {
    score += 100;
  }
  // Filename starts with query
  else if (filenameLower.startsWith(queryLower)) {
    score += 80;
  }
  // Filename contains query
  else if (filenameLower.includes(queryLower)) {
    score += 60;
  }
  // Path contains query
  else if (pathLower.includes(queryLower)) {
    score += 40;
  }

  // Bonus for shorter paths (files closer to root)
  const pathDepth = path.split("/").length;
  score += Math.max(0, 20 - pathDepth);

  // Bonus for common file extensions
  const commonExtensions = [
    ".ts",
    ".js",
    ".tsx",
    ".jsx",
    ".py",
    ".md",
    ".json",
  ];
  if (commonExtensions.some((ext) => filename.endsWith(ext))) {
    score += 5;
  }

  return score;
}

/**
 * Get directory structure from GitHub repository
 */
export async function getDirectoryStructure(
  repoUrl: string,
  path: string = "",
  ref: string = "main",
  githubToken: string
): Promise<FileSearchResult[]> {
  try {
    // Parse GitHub repository URL
    let cleanUrl: string;
    try {
      const url = new URL(repoUrl);
      cleanUrl = `${url.protocol}//${url.hostname}${url.pathname}`;
    } catch {
      cleanUrl = repoUrl;
    }

    const repoMatch = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      throw new Error("Invalid GitHub repository URL");
    }

    const [, owner, repo] = repoMatch;

    // Get directory contents
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
    const fullUrl =
      ref && ref !== "main"
        ? `${apiUrl}?ref=${encodeURIComponent(ref)}`
        : apiUrl;

    // Prepare headers with optional GitHub token
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Koala-Code-Reader",
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(fullUrl, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch directory: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Handle single file case
    if (!Array.isArray(data)) {
      const file = data as GitHubFileContent;
      return [
        {
          path: file.path,
          name: file.name,
          type: file.type === "file" ? "file" : "directory",
          size: file.size,
          sha: file.sha,
          url: file.url,
        },
      ];
    }

    // Handle directory case
    return data.map((item: GitHubFileContent) => ({
      path: item.path,
      name: item.name,
      type: item.type === "file" ? "file" : "directory",
      size: item.size,
      sha: item.sha,
      url: item.url,
    }));
  } catch (error) {
    console.error("Error getting directory structure:", error);
    throw error;
  }
}

/**
 * Read file from GitHub with automatic token extraction from environment
 */
export async function readFromGithubWithEnv(
  repoUrl: string,
  filePath: string,
  ref: string = "main",
  githubToken: string
): Promise<string> {
  return readFromGithub(repoUrl, filePath, ref, githubToken);
}

/**
 * Read file from storage with automatic token extraction from environment
 */
export async function readFileFromStorageWithEnv(
  filePath: string,
  storage: { basic: SharedStorage["basic"] },
  githubToken: string
): Promise<string> {
  return readFileFromStorage(filePath, storage, githubToken);
}

/**
 * Search files in GitHub with automatic token extraction from environment
 */
export async function searchFilesInGithubWithEnv(
  repoUrl: string,
  query: string,
  options: SearchOptions = {},
  ref: string = "main",
  githubToken: string
): Promise<FileSearchResult[]> {
  return searchFilesInGithub(repoUrl, query, options, ref, githubToken);
}

/**
 * Get directory structure with automatic token extraction from environment
 */
export async function getDirectoryStructureWithEnv(
  repoUrl: string,
  path: string = "",
  ref: string = "main",
  githubToken: string
): Promise<FileSearchResult[]> {
  return getDirectoryStructure(repoUrl, path, ref, githubToken);
}
