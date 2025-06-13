import { FileItem } from "@/lib/api-client";

export interface AnalysisData {
  fileUnderstandings: Array<{
    filename: string;
    understanding: string;
  }>;
  reducedOutput: string;
}

export interface RepoSetup {
  githubRepo: string;
  githubRef: string;
  repoName: string;
  mainGoal: string;
  specificAreas: string;
  files: FileItem[];
}

export type RequestType =
  | "improve_basic_input"
  | "user_feedback"
  | "analysis_complete"
  | "finish"
  | null;
