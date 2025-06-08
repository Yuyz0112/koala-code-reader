import { Hono } from "hono";
import { env } from "hono/adapter";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { readFromGithub } from "../code-reader/utils/fs";

const github = new Hono();

// GitHub API proxy endpoint to avoid CORS issues
github.get("/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const ref = c.req.query("ref") || "main"; // Get ref from query parameter, default to 'main'

  try {
    // Get GitHub API key from environment variables
    const githubToken = env(c).GITHUB_TOKEN;

    // Set up headers with optional authorization
    const headers: Record<string, string> = {
      "User-Agent": "Koala-Code-Reader",
      Accept: "application/vnd.github.v3+json",
    };

    if (githubToken) {
      headers["Authorization"] = `token ${githubToken}`;
    }

    // @ts-ignore
    const repoResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers }
    );
    if (!repoResponse.ok) {
      return c.json(
        { error: `Repository not found: ${repoResponse.status}` },
        repoResponse.status as ContentfulStatusCode
      );
    }

    // Try the specified ref directly
    // @ts-ignore
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
      { headers }
    );
    if (!treeResponse.ok) {
      return c.json(
        {
          error: `Unable to fetch repository contents for ref '${ref}': ${treeResponse.status}. Please check if the branch/tag exists.`,
        },
        treeResponse.status as ContentfulStatusCode
      );
    }

    const repoData = await repoResponse.json<{
      name: string;
      full_name: string;
      description: string | null;
    }>();
    const treeData = await treeResponse.json<{
      tree: unknown;
    }>();

    return c.json({
      name: repoData.name,
      full_name: repoData.full_name,
      description: repoData.description,
      ref: ref, // Include the ref in the response
      tree: treeData.tree,
    });
  } catch (error: any) {
    return c.json(
      {
        error: `Failed to fetch repository: ${
          error?.message || "Unknown error"
        }`,
      },
      500
    );
  }
});

// New endpoint for reading file contents
github.get("/:owner/:repo/contents/*", async (c) => {
  const { owner, repo } = c.req.param();
  const filePath = c.req.param("*") || ""; // Get the file path from the wildcard
  const ref = c.req.query("ref") || "main";

  try {
    // Construct the GitHub URL
    const githubUrl = `https://github.com/${owner}/${repo}`;

    // Use the fs utility to read the file content
    const content = await readFromGithub(githubUrl, filePath, ref);

    return c.json({
      content,
      path: filePath,
      ref,
      encoding: "utf-8",
    });
  } catch (error: any) {
    console.error("Error reading file from GitHub:", error);

    if (error.message.includes("File not found")) {
      return c.json({ error: `File not found: ${filePath}` }, 404);
    }

    return c.json(
      { error: `Failed to read file: ${error.message || "Unknown error"}` },
      500
    );
  }
});

export { github };
