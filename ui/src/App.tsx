import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useFlowAPI } from "@/hooks/use-flow-api";
import { RepoSetupForm } from "@/components/RepoSetupForm";
import { InteractionPanel } from "@/components/InteractionPanel";
import { FlowsList } from "@/components/FlowsList";
import { FileViewer } from "@/components/FileViewer";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { RepoSetup, AnalysisData } from "@/types";
import { ArrowLeft } from "lucide-react";

function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisData>({
    fileSummaries: [],
    reducedOutput: "",
  });
  const [currentView, setCurrentView] = useState<"list" | "analysis">("list");

  const { toast } = useToast();

  const {
    analysisStarted,
    currentRequestType,
    currentRequestData,
    flowStatus,
    flows,
    isLoadingFlows,
    startAnalysis,
    fetchRepo,
    handleUserInteraction,
    loadFlows,
    deleteFlow,
    loadFlow,
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
      setCurrentView("analysis");
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
    if (!result.success) {
      toast({
        title: "Error",
        description: result.error || "Failed to fetch repository",
        variant: "destructive",
      });
    }
    return result;
  };

  const handleNewFlow = () => {
    setCurrentView("analysis");
  };

  const handleLoadFlow = async (runId: string) => {
    const result = await loadFlow(runId);
    if (result.success) {
      setCurrentView("analysis");
      toast({
        title: "Flow Loaded",
        description: `Flow has been loaded successfully.`,
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to load flow",
        variant: "destructive",
      });
    }
    return result;
  };

  const handleDeleteFlow = async (runId: string) => {
    const result = await deleteFlow(runId);
    if (result.success) {
      toast({
        title: "Flow Deleted",
        description: "Flow has been deleted successfully.",
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to delete flow",
        variant: "destructive",
      });
    }
    return result;
  };

  const handleBackToList = () => {
    setCurrentView("list");
  };

  if (currentView === "list") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto px-4 py-8">
          <FlowsList
            flows={flows}
            isLoading={isLoadingFlows}
            onLoadFlows={loadFlows}
            onDeleteFlow={handleDeleteFlow}
            onLoadFlow={handleLoadFlow}
            onNewFlow={handleNewFlow}
          />
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className=" mx-auto px-4 py-8 h-screen flex flex-col">
        <div className="mb-4">
          <Button variant="outline" onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Flows
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 h-full overflow-hidden">
            {analysisStarted ? null : (
              <RepoSetupForm
                onSubmit={handleRepoSubmit}
                onFetchRepo={handleFetchRepo}
              />
            )}

            <Tabs defaultValue="current-file" className="flex flex-col h-full">
              <TabsList>
                <TabsTrigger value="current-file">Current File</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="summaries">File Summaries</TabsTrigger>
              </TabsList>

              <TabsContent
                value="current-file"
                className="flex-1 overflow-hidden space-y-4"
              >
                <FileViewer
                  filePath={flowStatus?.currentFile?.name || null}
                  githubUrl={flowStatus?.basic?.githubUrl}
                  githubRef={flowStatus?.basic?.githubRef}
                />
              </TabsContent>

              <TabsContent
                value="output"
                className="flex-1 overflow-hidden space-y-4"
              >
                <div className="p-6 bg-white rounded-lg border h-full overflow-auto">
                  {analysisData.reducedOutput ? (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">
                        Analysis Summary
                      </h3>
                      <pre className="whitespace-pre-wrap text-sm">
                        {analysisData.reducedOutput}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>Analysis output will appear here.</p>
                      <p className="text-sm">
                        Start by submitting a repository for analysis.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="summaries" className="flex-1 space-y-4">
                <div className="p-6 bg-white rounded-lg border h-full overflow-auto">
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

          <div className="lg:col-span-1 h-full overflow-hidden">
            <InteractionPanel
              requestType={currentRequestType}
              requestData={currentRequestData}
              onSendResponse={handleUserInteraction}
            />
          </div>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default App;
