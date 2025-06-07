export interface AnalysisData {
  fileSummaries: Array<{
    filename: string;
    summary: string;
  }>;
  reducedOutput: string;
}

export interface RepoSetup {
  githubRepo: string;
  githubRef: string;
  repoName: string;
  mainGoal: string;
  specificAreas: string;
  fileStructure: string;
}

export type RequestType =
  | "improve_basic_input"
  | "user_feedback"
  | "analysis_complete"
  | "finish"
  | null;
