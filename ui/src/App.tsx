import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useFlowAPI } from "@/hooks/use-flow-api";
import { RepoSetupForm } from "@/components/RepoSetupForm";
import { InteractionPanel } from "@/components/InteractionPanel";
import { FlowsList } from "@/components/FlowsList";
import { FileViewer } from "@/components/FileViewer";
import { FileUnderstandingList } from "@/components/FileUnderstandingList";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { RepoSetup, AnalysisData } from "@/types";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/Markdown";

function App() {
  const [analysisData, setAnalysisData] = useState<AnalysisData>({
    fileUnderstandings: [],
    reducedOutput: "",
  });
  const [currentView, setCurrentView] = useState<"list" | "analysis">("list");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("current-file");

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
    resetFlow,
  } = useFlowAPI();

  // Update analysis data when flow status changes
  useEffect(() => {
    if (flowStatus) {
      // Extract file understandings from basic.files array
      const fileUnderstandings =
        flowStatus.basic?.files
          ?.filter((file) => file.understanding) // Only include files with understandings
          .map((file) => ({
            filename: file.path,
            understanding: file.understanding!,
          })) || [];

      setAnalysisData({
        fileUnderstandings,
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
    // Clear previous flow state when starting a new flow
    resetFlow();
    setAnalysisData({
      fileUnderstandings: [],
      reducedOutput: "",
    });
    setSelectedFile(null);
    setActiveTab("current-file");
    setCurrentView("analysis");
  };

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
    setActiveTab("current-file");
  };

  const handleLoadFlow = async (runId: string) => {
    const result = await loadFlow(runId);
    if (result.success) {
      setCurrentView("analysis");
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

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex flex-col h-full"
            >
              <TabsList>
                <TabsTrigger value="current-file">Current File</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
                <TabsTrigger value="summaries">File Understandings</TabsTrigger>
              </TabsList>

              <TabsContent
                value="current-file"
                className="flex-1 overflow-hidden space-y-4"
              >
                <FileViewer
                  filePath={
                    selectedFile || flowStatus?.currentFile?.name || null
                  }
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
                      <h3 className="text-lg font-semibold mb-4">Analysis</h3>
                      <Markdown>{analysisData.reducedOutput}</Markdown>
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

              <TabsContent value="summaries" className="flex-1 overflow-hidden">
                <FileUnderstandingList
                  files={flowStatus?.basic?.files || []}
                  history={flowStatus?.history || []}
                  onFileSelect={handleFileSelect}
                />
              </TabsContent>
            </Tabs>
          </div>

          {analysisStarted && (
            <div className="lg:col-span-1 h-full overflow-hidden">
              <InteractionPanel
                requestType={currentRequestType}
                requestData={currentRequestData}
                onSendResponse={handleUserInteraction}
                flowStatus={flowStatus}
              />
            </div>
          )}
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default App;
