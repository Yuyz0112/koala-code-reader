import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * GitHub repository information
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

/**
 * Parse and extract owner and repository name from a GitHub URL
 * Handles URLs with search parameters and other URL components
 *
 * @param repoUrl - The GitHub repository URL (e.g., "https://github.com/owner/repo?tab=readme")
 * @returns Object with owner and repo, or null if URL is invalid
 */
export function parseGitHubUrl(repoUrl: string): GitHubRepoInfo | null {
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

    // Extract owner and repo from GitHub URL
    const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return null;
    }

    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, "");

    return { owner, repo: cleanRepo };
  } catch {
    return null;
  }
}
