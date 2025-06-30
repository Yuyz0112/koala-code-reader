import { useState, useEffect, useRef, useCallback } from "react";
import { RequestType } from "@/types";
import {
  apiClient,
  type FlowStatus,
  type StartAnalysisRequest,
  type FlowListItem,
} from "@/lib/api-client";
import { parseGitHubUrl } from "@/lib/utils";

export const useFlowAPI = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowStatus | null>(null);
  const [currentRequestType, setCurrentRequestType] =
    useState<RequestType>(null);
  const [currentRequestData, setCurrentRequestData] = useState<any>(null);
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const isRequestInProgressRef = useRef(false);

  const addMessage = useCallback((message: string) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    isRequestInProgressRef.current = false;
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

        // If a request is already in progress, skip this poll
        if (isRequestInProgressRef.current) {
          console.log("Skipping poll - request already in progress");
          return;
        }

        isRequestInProgressRef.current = true;

        try {
          const data = await apiClient.getFlowStatus(runId);
          setFlowStatus(data.shared || null);

          // Handle different flow states
          if (data.shared) {
            const { callToAction, completed, currentFile, nextFile } =
              data.shared;

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
                    message: currentFile?.analysis?.understanding,
                    currentFile: currentFile?.name,
                    nextFile: nextFile
                      ? {
                          name: nextFile.name,
                          reason: nextFile.reason,
                        }
                      : null,
                  });
                  break;

                case "finish":
                  addMessage("🎉 Analysis complete! Check the results tab.");
                  setCurrentRequestType("finish");
                  setCurrentRequestData({
                    message: "Analysis has been completed successfully.",
                    results: {
                      fileUnderstandings:
                        data.shared.basic?.files
                          ?.filter((f) => f.understanding)
                          .map((f) => ({
                            filename: f.path,
                            understanding: f.understanding!,
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
        } finally {
          // Reset request state regardless of success or error
          isRequestInProgressRef.current = false;
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
        // Parse GitHub URL
        const repoInfo = parseGitHubUrl(repoUrl);
        if (!repoInfo) {
          addMessage("❌ Invalid GitHub URL format");
          return {
            success: false,
            error: "Please provide a valid GitHub repository URL.",
          };
        }

        const { owner, repo } = repoInfo;

        addMessage(`📥 Fetching repository structure for ${owner}/${repo}...`);

        const repoData = await apiClient.fetchGitHubRepo(owner, repo, ref);

        addMessage(`✅ Repository structure fetched for ${owner}/${repo}`);
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

  // Function to read file content from GitHub
  const readFileFromGitHub = useCallback(
    async (repoUrl: string, filePath: string, ref: string = "main") => {
      try {
        // Parse GitHub URL
        const repoInfo = parseGitHubUrl(repoUrl);
        if (!repoInfo) {
          return {
            success: false,
            error: "Please provide a valid GitHub repository URL.",
          };
        }

        const { owner, repo } = repoInfo;

        const fileData = await apiClient.readFileFromGitHub(
          owner,
          repo,
          filePath,
          ref
        );

        return { success: true, fileData };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to read file";
        return { success: false, error: errorMessage };
      }
    },
    []
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
      } else if (response.type === "user_feedback") {
        // Handle specific user feedback actions (approve, reject, refine)
        inputType = "user_feedback";
        inputData = {
          action: response.action,
          reason: response.reason || "",
          nextFile: response.nextFile || undefined,
          ...(response.userUnderstanding && {
            userUnderstanding: response.userUnderstanding,
          }),
        };
      } else {
        // Handle regular user input
        inputType = currentRequestType;

        switch (currentRequestType) {
          case "improve_basic_input":
            inputData = {
              response: response.response,
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

  // Load all flows
  const loadFlows = useCallback(async () => {
    setIsLoadingFlows(true);
    try {
      const data = await apiClient.listFlows();
      setFlows(data.flows);
      return { success: true, flows: data.flows };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load flows";
      return { success: false, error: errorMessage };
    } finally {
      setIsLoadingFlows(false);
    }
  }, []);

  // Delete a flow
  const deleteFlow = useCallback(
    async (runId: string) => {
      try {
        await apiClient.deleteFlow(runId);
        // Refresh flows list after deletion
        await loadFlows();
        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to delete flow";
        return { success: false, error: errorMessage };
      }
    },
    [loadFlows]
  );

  // Load a specific flow and set it as current
  const loadFlow = useCallback(
    async (runId: string) => {
      try {
        const data = await apiClient.getFlowStatus(runId);
        setCurrentRunId(runId);
        setFlowStatus(data.shared || null);

        // Start polling if flow is not completed
        const completed =
          data.shared?.completed && Boolean(data.shared.reducedOutput);
        if (data.shared && !completed) {
          startPolling(runId);
        }

        return { success: true, flow: data.shared };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to load flow";
        return { success: false, error: errorMessage };
      }
    },
    [startPolling]
  );

  // Reset all flow state (for starting a new flow)
  const resetFlow = useCallback(() => {
    stopPolling();
    setMessages([]);
    setCurrentRunId(null);
    setFlowStatus(null);
    setCurrentRequestType(null);
    setCurrentRequestData(null);
  }, [stopPolling]);

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
    flows,
    isLoadingFlows,
    startAnalysis,
    fetchRepo,
    readFileFromGitHub,
    handleUserInteraction,
    loadFlows,
    deleteFlow,
    loadFlow,
    resetFlow,
  };
};
