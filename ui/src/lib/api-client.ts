// API client for flow management
export interface FlowStatus {
  runId: string;
  completed: boolean;
  callToAction: "improve_basic_input" | "user_feedback" | "finish" | null;
  currentFile?: {
    name: string;
    analysis?: {
      summary: string;
    };
  };
  reducedOutput: string;
  basic?: {
    repoName: string;
    mainGoal: string;
    specificAreas?: string;
    files: Array<{
      path: string;
      status: string;
      type: string;
      summary?: string; // Analysis summary for analyzed files
    }>;
  };
}

export interface FlowAPIResponse {
  runId: string;
  status?: "started" | "resumed" | "completed" | "error";
  message?: string;
  shared?: FlowStatus;
}

export interface StartAnalysisRequest {
  repoName: string;
  mainGoal: string;
  specificAreas: string;
  githubRepo: string;
  githubRef: string;
}

export interface UserInputRequest {
  inputType: string;
  inputData: any;
}

export class FlowAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Start a new flow analysis
   */
  async startAnalysis(data: StartAnalysisRequest): Promise<FlowAPIResponse> {
    const response = await fetch(`${this.baseUrl}/api/flows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        basic: {
          repoName: data.repoName,
          mainGoal: data.mainGoal,
          specificAreas: data.specificAreas,
          githubUrl: data.githubRepo,
          githubRef: data.githubRef,
          files: [], // Will be populated by the flow
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start analysis: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get flow status by run ID
   */
  async getFlowStatus(runId: string): Promise<FlowAPIResponse> {
    const response = await fetch(`${this.baseUrl}/api/flows/${runId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Flow not found");
      }
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Send user input to a flow
   */
  async sendUserInput(runId: string, input: UserInputRequest): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/flows/${runId}/input`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to send input: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Delete a flow
   */
  async deleteFlow(runId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/flows/${runId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`Failed to delete flow: ${response.status}`);
    }
  }

  /**
   * Fetch GitHub repository structure
   */
  async fetchGitHubRepo(
    owner: string,
    repo: string,
    ref: string
  ): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/api/github/${owner}/${repo}?ref=${ref}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch repository: ${response.status}`);
    }

    return response.json();
  }
}

// Export a default instance
export const apiClient = new FlowAPIClient();
