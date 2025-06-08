import { useState, useEffect, useRef, useCallback } from "react";
import { RequestType } from "@/types";
import {
  apiClient,
  type FlowStatus,
  type StartAnalysisRequest,
} from "@/lib/api-client";

export const useFlowAPI = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus | null>(null);
  const [currentRequestType, setCurrentRequestType] =
    useState<RequestType>(null);
  const [currentRequestData, setCurrentRequestData] = useState<any>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  const addMessage = useCallback((message: string) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (runId: string) => {
      if (isPollingRef.current) return;

      isPollingRef.current = true;

      const poll = async () => {
        // If polling was stopped, don't continue
        if (!isPollingRef.current) return;

        try {
          const data = await apiClient.getFlowStatus(runId);
          setFlowStatus(data.shared || null);

          // Handle different flow states
          if (data.shared) {
            const { callToAction, completed, currentFile } = data.shared;

            // Update progress messages (avoid duplicate messages)
            if (currentFile && currentFile.name) {
              const progressMessage = `📄 Analyzing: ${currentFile.name}`;
              // Only add message if it's different from the last one
              setMessages((prev) => {
                if (
                  prev.length === 0 ||
                  prev[prev.length - 1] !== progressMessage
                ) {
                  return [...prev, progressMessage];
                }
                return prev;
              });
            }

            // Handle callToAction changes
            if (callToAction && callToAction !== currentRequestType) {
              switch (callToAction) {
                case "improve_basic_input":
                  addMessage(
                    "💡 AI suggests improving the input. Please review and update."
                  );
                  setCurrentRequestType("improve_basic_input");
                  setCurrentRequestData({
                    message:
                      "The AI suggests improving your input for better analysis results.",
                    suggestion:
                      "Please provide more specific information about your repository.",
                  });
                  break;

                case "user_feedback":
                  addMessage(
                    "❓ AI has a question about the analysis. Please provide feedback."
                  );
                  setCurrentRequestType("user_feedback");
                  setCurrentRequestData({
                    message:
                      "The AI needs your feedback to continue the analysis.",
                    currentFile: currentFile?.name,
                  });
                  break;

                case "finish":
                  addMessage("🎉 Analysis complete! Check the results tab.");
                  setCurrentRequestType("finish");
                  setCurrentRequestData({
                    message: "Analysis has been completed successfully.",
                    results: {
                      fileSummaries:
                        data.shared.basic?.files
                          ?.filter((f) => f.summary)
                          .map((f) => ({
                            filename: f.path,
                            summary: f.summary!,
                          })) || [],
                      reducedOutput: data.shared.reducedOutput,
                    },
                  });
                  stopPolling();
                  return;
              }
            }

            if (completed) {
              addMessage("✅ Flow completed");
              stopPolling();
              return;
            }
          }
        } catch (error) {
          console.error("Polling error:", error);

          // Handle specific error cases
          if (error instanceof Error && error.message === "Flow not found") {
            addMessage("❌ Flow not found");
            setCurrentRunId(null);
            setFlowStatus(null);
            stopPolling();
            return;
          }

          addMessage(
            `❌ Error checking flow status: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
          // Continue polling on error - setInterval will retry automatically
        }
      };

      // Start with immediate poll, then continue with interval
      poll();
      pollingRef.current = setInterval(poll, 5000);
    },
    [addMessage, currentRequestType, stopPolling]
  );

  const startAnalysis = useCallback(
    async (repoData: StartAnalysisRequest) => {
      try {
        addMessage("🚀 Starting analysis...");

        const data = await apiClient.startAnalysis(repoData);
        setCurrentRunId(data.runId);
        addMessage(`✅ Analysis started (ID: ${data.runId})`);

        // Start polling for updates
        startPolling(data.runId);

        return { success: true, runId: data.runId };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to start analysis";
        addMessage(`❌ ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    },
    [addMessage, startPolling]
  );

  // Function to fetch repository structure
  const fetchRepo = useCallback(
    async (repoUrl: string, ref: string) => {
      try {
        // Extract owner and repo from GitHub URL
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
          addMessage("❌ Invalid GitHub URL format");
          return {
            success: false,
            error: "Please provide a valid GitHub repository URL.",
          };
        }

        const [, owner, repo] = match;
        const cleanRepo = repo.replace(/\.git$/, "");

        addMessage(
          `📥 Fetching repository structure for ${owner}/${cleanRepo}...`
        );

        const repoData = await apiClient.fetchGitHubRepo(owner, cleanRepo, ref);

        addMessage(`✅ Repository structure fetched for ${owner}/${cleanRepo}`);
        return { success: true, repoData };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to fetch repository";
        addMessage(`❌ ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    },
    [addMessage]
  );

  // Main function to handle user interaction responses
  const handleUserInteraction = useCallback(
    async (response: any) => {
      if (!currentRequestType) {
        return { success: false, error: "No active request" };
      }

      if (!currentRunId) {
        addMessage("❌ No active flow");
        return { success: false, error: "No active flow" };
      }

      let inputType: string;
      let inputData: any;

      if (response.type === "continue") {
        // Handle continue button (for finish states)
        inputType = "finish";
        inputData = {};
      } else {
        // Handle regular user input
        inputType = currentRequestType;

        switch (currentRequestType) {
          case "improve_basic_input":
            inputData = {
              response: response.response,
            };
            break;

          case "user_feedback":
            inputData = {
              action: "accept",
              reason: response.response,
            };
            break;

          case "finish":
            inputData = {};
            break;

          default:
            inputData = { response: response.response };
        }
      }

      try {
        const data = await apiClient.sendUserInput(currentRunId, {
          inputType,
          inputData,
        });

        addMessage("✅ Response sent to AI");

        // Clear current request automatically after sending
        setCurrentRequestType(null);
        setCurrentRequestData(null);

        // Resume polling if it was stopped and this isn't a final action
        if (!isPollingRef.current && inputType !== "finish") {
          startPolling(currentRunId);
        } else if (inputType === "finish") {
          // For finish action, stop polling completely
          stopPolling();
        }

        return { success: true, data };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to send input";
        addMessage(`❌ ${errorMessage}`);
        return { success: false, error: errorMessage };
      }
    },
    [currentRequestType, currentRunId, addMessage, startPolling, stopPolling]
  );

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    messages,
    analysisStarted: !!currentRunId,
    currentRequestType,
    currentRequestData,
    flowStatus,
    currentRunId,
    startAnalysis,
    fetchRepo,
    handleUserInteraction,
  };
};
