export interface AnalysisData {
  allSummaries: string[];
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

export interface WebSocketMessage {
  type: string;
  data?: any;
  error?: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type RequestType =
  | "improve_basic_input"
  | "user_feedback"
  | "analysis_complete"
  | null;
