import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWebSocket } from "@/hooks/useWebSocket";
import { RepoSetupForm } from "@/components/RepoSetupForm";
import { MessagesPanel } from "@/components/MessagesPanel";
import { InteractionPanel } from "@/components/InteractionPanel";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { RepoSetup, AnalysisData } from "@/types";

function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisData>({
    allSummaries: [],
    reducedOutput: "",
  });

  const { toast } = useToast();

  const {
    status,
    messages,
    analysisStarted,
    currentRequestType,
    currentRequestData,
    connect,
    disconnect,
    sendMessage,
    setCurrentRequestType,
    addMessage,
  } = useWebSocket();

  const handleConnect = () => {
    connect();
  };

  const handleDisconnect = () => {
    disconnect();
    setAnalysisData({ allSummaries: [], reducedOutput: "" });
  };

  const handleRepoSubmit = (repoData: RepoSetup) => {
    if (status !== "connected") {
      toast({
        title: "Connection Required",
        description: "Please connect to the server first.",
        variant: "destructive",
      });
      return;
    }

    sendMessage({
      type: "start_analysis",
      data: repoData,
    });

    toast({
      title: "Analysis Started",
      description: "Repository analysis has been initiated.",
    });
  };

  const handleFetchRepo = async (repoUrl: string, ref: string) => {
    try {
      // Extract owner and repo from GitHub URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        toast({
          title: "Invalid URL",
          description: "Please provide a valid GitHub repository URL.",
          variant: "destructive",
        });
        return;
      }

      const [, owner, repo] = match;
      const cleanRepo = repo.replace(/\.git$/, "");

      const apiUrl = `/api/github/${owner}/${cleanRepo}?ref=${ref}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch repository: ${response.status}`);
      }

      await response.json();

      // Update the file structure in the form
      addMessage(`✅ Repository structure fetched for ${owner}/${cleanRepo}`);

      toast({
        title: "Repository Fetched",
        description: `Successfully fetched structure for ${owner}/${cleanRepo}`,
      });
    } catch (error) {
      console.error("Error fetching repository:", error);
      toast({
        title: "Fetch Failed",
        description:
          error instanceof Error ? error.message : "Failed to fetch repository",
        variant: "destructive",
      });
    }
  };

  const handleInteractionResponse = (response: any) => {
    sendMessage({
      type: "user_response",
      data: response,
    });

    toast({
      title: "Response Sent",
      description: "Your response has been sent to the AI.",
    });
  };

  const handleClearRequest = () => {
    setCurrentRequestType(null);
  };

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Koala Code Reader
          </h1>
          <p className="text-gray-600">
            Intelligent repository analysis powered by AI
          </p>
        </div>

        <div className="mb-4 flex gap-2">
          {!isConnected ? (
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect to Server"}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
        </div>

        {currentRequestType && (
          <div className="mb-6">
            <InteractionPanel
              requestType={currentRequestType}
              requestData={currentRequestData}
              onSendResponse={handleInteractionResponse}
              onClearRequest={handleClearRequest}
              disabled={!isConnected}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs defaultValue="setup" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="setup">Setup</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="summaries">File Summaries</TabsTrigger>
              </TabsList>

              <TabsContent value="setup" className="space-y-4">
                <RepoSetupForm
                  onSubmit={handleRepoSubmit}
                  onFetchRepo={handleFetchRepo}
                  disabled={!isConnected || analysisStarted}
                />
              </TabsContent>

              <TabsContent value="results" className="space-y-4">
                <div className="p-6 bg-white rounded-lg border">
                  {analysisData.reducedOutput ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">
                        Analysis Results
                      </h3>
                      <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-md overflow-auto">
                        {analysisData.reducedOutput}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>No analysis results yet.</p>
                      <p className="text-sm">
                        Start an analysis to see results here.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="summaries" className="space-y-4">
                <div className="p-6 bg-white rounded-lg border">
                  {analysisData.allSummaries.length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">
                        File Summaries ({analysisData.allSummaries.length})
                      </h3>
                      <div className="space-y-4">
                        {analysisData.allSummaries.map((summary, index) => (
                          <div
                            key={index}
                            className="p-4 bg-gray-50 rounded-md"
                          >
                            <pre className="whitespace-pre-wrap text-sm">
                              {summary}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>No file summaries yet.</p>
                      <p className="text-sm">
                        File summaries will appear here as they are generated.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-1">
            <MessagesPanel messages={messages} status={status} />
          </div>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default App;
