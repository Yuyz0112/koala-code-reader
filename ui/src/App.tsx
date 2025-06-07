import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFlowAPI } from "@/hooks/use-flow-api";
import { RepoSetupForm } from "@/components/RepoSetupForm";
import { MessagesPanel } from "@/components/MessagesPanel";
import { InteractionPanel } from "@/components/InteractionPanel";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { RepoSetup, AnalysisData } from "@/types";

function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisData>({
    fileSummaries: [],
    reducedOutput: "",
  });

  const { toast } = useToast();

  const {
    messages,
    analysisStarted,
    currentRequestType,
    currentRequestData,
    flowStatus,
    startAnalysis,
    fetchRepo,
    handleUserInteraction,
  } = useFlowAPI();

  // Update analysis data when flow status changes
  useEffect(() => {
    if (flowStatus) {
      // Extract file summaries from basic.files array
      const fileSummaries =
        flowStatus.basic?.files
          ?.filter((file) => file.summary) // Only include files with summaries
          .map((file) => ({
            filename: file.path,
            summary: file.summary!,
          })) || [];

      setAnalysisData({
        fileSummaries,
        reducedOutput: flowStatus.reducedOutput || "",
      });
    }
  }, [flowStatus]);

  const handleRepoSubmit = async (repoData: RepoSetup) => {
    const result = await startAnalysis(repoData);

    if (result.success) {
      toast({
        title: "Analysis Started",
        description: "Repository analysis has been initiated.",
      });
    } else {
      toast({
        title: "Analysis Failed",
        description: result.error || "Failed to start analysis",
        variant: "destructive",
      });
    }
  };

  const handleFetchRepo = async (repoUrl: string, ref: string) => {
    const result = await fetchRepo(repoUrl, ref);

    if (result.success) {
      toast({
        title: "Repository Fetched",
        description: "Successfully fetched repository structure",
      });
    } else {
      toast({
        title: "Fetch Failed",
        description: result.error || "Failed to fetch repository",
        variant: "destructive",
      });
    }
  };

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
          {analysisStarted ? null : (
            <div className="text-sm text-gray-600">
              Ready to start repository analysis
            </div>
          )}
        </div>

        {currentRequestType && (
          <div className="mb-6">
            <InteractionPanel
              requestType={currentRequestType}
              requestData={currentRequestData}
              onSendResponse={handleUserInteraction}
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
                  disabled={analysisStarted}
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
                  {analysisData.fileSummaries.length > 0 ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">
                        File Summaries ({analysisData.fileSummaries.length})
                      </h3>
                      <div className="space-y-4">
                        {analysisData.fileSummaries.map((summary, index) => (
                          <div
                            key={index}
                            className="p-4 bg-gray-50 rounded-md"
                          >
                            <h4 className="font-medium text-sm text-gray-700 mb-2">
                              {summary.filename}
                            </h4>
                            <pre className="whitespace-pre-wrap text-sm text-gray-600">
                              {summary.summary}
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
            <MessagesPanel messages={messages} />
          </div>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default App;
