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

export async function readFile(path: string): Promise<string> {
  try {
    console.log("Reading file from:", path);
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    console.log("File read successfully");
    return await response.text();
  } catch (error) {
    throw error;
  }
}

export async function readFromGithub(
  repoUrl: string,
  filePath: string,
  ref: string = "main"
): Promise<string> {
  try {
    // Parse GitHub repository URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
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
    
    console.log(`Reading from GitHub API (${ref}):`, apiUrl);

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Koala-Code-Reader'
      }
    });

    if (response.ok) {
      const data = await response.json() as GitHubFileContent;
      
      // Check if it's a file (not a directory)
      if (data.type !== 'file') {
        throw new Error(`Path ${cleanPath} is not a file`);
      }
      
      // GitHub API returns base64 encoded content
      if (data.encoding === 'base64') {
        // Use atob in browser environment, Buffer in Node.js environment
        let content: string;
        try {
          content = atob(data.content.replace(/\s/g, ''));
        } catch (e) {
          // If atob is not available, try using Buffer (Node.js environment)
          content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        console.log("File read successfully from GitHub API");
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
  storage: { basic: SharedStorage["basic"] }
): Promise<string> {
  const githubUrl = storage.basic.githubUrl;
  const githubRef = storage.basic.githubRef || "main";

  // If GitHub URL is available, read from GitHub first
  if (githubUrl) {
    try {
      return await readFromGithub(githubUrl, filePath, githubRef);
    } catch (error) {
      console.log("Failed to read from GitHub, falling back to local:", error);
      // Fall back to local reading when GitHub reading fails
      return await readFile(filePath);
    }
  } else {
    // Read directly from local when no GitHub URL is available
    return await readFile(filePath);
  }
}
