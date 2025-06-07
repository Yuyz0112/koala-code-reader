import { SharedStorage } from "./storage";

export async function readFile(path: string): Promise<string> {
  try {
    // @ts-ignore
    console.log("Reading file from:", path);
    // @ts-ignore
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    // @ts-ignore
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
    // 解析 GitHub 仓库 URL
    const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!repoMatch) {
      throw new Error("Invalid GitHub repository URL");
    }

    const [, owner, repo] = repoMatch;

    // 移除文件路径前面的斜杠
    const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;

    // 使用 GitHub Contents API
    let apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
    if (ref && ref !== "main") {
      apiUrl += `?ref=${encodeURIComponent(ref)}`;
    }
    
    // @ts-ignore
    console.log(`Reading from GitHub API (${ref}):`, apiUrl);

    // @ts-ignore
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Koala-Code-Reader'
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      // 检查是否是文件（而不是目录）
      if (data.type !== 'file') {
        throw new Error(`Path ${cleanPath} is not a file`);
      }
      
      // GitHub API 返回 base64 编码的内容
      if (data.encoding === 'base64') {
        // 在浏览器环境中使用 atob，在 Node.js 环境中使用 Buffer
        let content: string;
        try {
          // @ts-ignore
          content = atob(data.content.replace(/\s/g, ''));
        } catch (e) {
          // 如果 atob 不可用，尝试使用 Buffer (Node.js 环境)
          // @ts-ignore
          content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        // @ts-ignore
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
    // @ts-ignore
    console.error("Error reading from GitHub API:", error);
    throw error;
  }
}

// 智能文件读取器：使用 SharedStorage 中的配置自动选择读取源
export async function readFileFromStorage(
  filePath: string,
  storage: { basic: SharedStorage["basic"] }
): Promise<string> {
  const githubUrl = storage.basic.githubUrl;
  const githubRef = storage.basic.githubRef || "main";

  // 如果有 GitHub URL，优先从 GitHub 读取
  if (githubUrl) {
    try {
      return await readFromGithub(githubUrl, filePath, githubRef);
    } catch (error) {
      // @ts-ignore
      console.log("Failed to read from GitHub, falling back to local:", error);
      // GitHub 读取失败时，回退到本地读取
      return await readFile(filePath);
    }
  } else {
    // 没有 GitHub URL 时，直接从本地读取
    return await readFile(filePath);
  }
}
