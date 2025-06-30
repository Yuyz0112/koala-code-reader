import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RequestType } from "@/types";
import {
  CheckCircle,
  XCircle,
  Edit3,
  Check,
  ChevronsUpDown,
  FileText,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { FileItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface InteractionPanelProps {
  requestType: RequestType;
  requestData: any;
  onSendResponse: (response: any) => void;
  disabled?: boolean;
  flowStatus?: {
    completed?: boolean;
    currentFile?: {
      name: string;
      analysis?: {
        understanding: string;
      };
    };
    nextFile?: {
      name: string;
      reason: string;
    };
    basic?: {
      files?: FileItem[];
    };
  } | null;
}

export function InteractionPanel({
  requestType,
  requestData,
  onSendResponse,
  disabled = false,
  flowStatus,
}: InteractionPanelProps) {
  const [response, setResponse] = useState("");
  const [feedbackMode, setFeedbackMode] = useState<
    "accept" | "reject" | "refine" | null
  >(null);
  const [selectedNextFile, setSelectedNextFile] = useState<string>("");
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (response.trim()) {
      onSendResponse({
        type: requestType,
        response: response.trim(),
        originalData: requestData,
      });
      setResponse("");
    }
  };

  const handleFeedbackAction = (
    action: "accept" | "reject" | "refine" | "finish"
  ) => {
    if (action === "accept") {
      // For accept, send the feedback directly without requiring additional input
      onSendResponse({
        type: "user_feedback",
        action: "accept",
        reason: "User approved the analysis",
        originalData: requestData,
      });
    } else if (action === "finish") {
      // For finish, send the feedback directly to complete analysis early
      onSendResponse({
        type: "user_feedback",
        action: "finish",
        originalData: requestData,
      });
    } else {
      // For reject and refine, set the mode to show the input form
      setFeedbackMode(action);
    }
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMode || !response.trim()) return;

    let feedbackData: any = {
      type: "user_feedback",
      action: feedbackMode,
      originalData: requestData,
    };

    if (feedbackMode === "reject") {
      feedbackData.reason = response.trim();
    } else if (feedbackMode === "refine") {
      feedbackData.userUnderstanding = response.trim();
      feedbackData.reason = "User provided refined understanding";
      // Add selected next file if provided
      if (selectedNextFile) {
        feedbackData.nextFile = selectedNextFile;
      }
    }

    onSendResponse(feedbackData);
    setResponse("");
    setSelectedNextFile("");
    setOpen(false);
    setFeedbackMode(null);
  };

  const handleContinue = () => {
    onSendResponse({
      type: "continue",
      originalData: requestData,
    });
  };

  if (!requestType) {
    // Check if flow is completed
    if (flowStatus?.completed) {
      return (
        <Card className="border-green-200 bg-green-50 h-full flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle className="text-green-800 flex items-center gap-2">
              AI Assistant Status
            </CardTitle>
            <p className="text-sm text-green-700">
              Your repository analysis has been completed successfully
            </p>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="space-y-4 text-sm text-green-700 pr-6">
                <div className="p-3 bg-white rounded-md border border-green-200">
                  <ul className="space-y-1 text-green-600">
                    <li>• All repository files have been analyzed</li>
                    <li>• Summaries and insights have been generated</li>
                    <li>• Results are ready for review</li>
                  </ul>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-blue-200 bg-blue-50 h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-blue-800 flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
            AI Assistant Status
          </CardTitle>
          <p className="text-sm text-blue-600">
            The AI is currently working on your analysis
            <span className="inline-flex items-center gap-1 ml-1">
              <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"></span>
              <span
                className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              ></span>
              <span
                className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              ></span>
            </span>
          </p>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 text-sm text-gray-700 pr-6">
              <div className="p-3 bg-white rounded-md border border-blue-200">
                <p className="font-medium text-gray-800 mb-2">
                  What's happening now:
                </p>
                <ul className="space-y-2 text-gray-600">
                  <li>• AI is analyzing your repository files</li>
                  <li>• Processing code structure and patterns</li>
                  <li>• Generating summaries and insights</li>
                </ul>
              </div>

              <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="font-medium text-blue-800 mb-2">
                  💡 What you can do:
                </p>
                <ul className="space-y-2 text-blue-700">
                  <li>• Monitor progress in the Analysis Progress panel</li>
                  <li>
                    • View current file being analyzed in the Current File tab
                  </li>
                  <li>• Check completed summaries in the File Summaries tab</li>
                  <li>• Wait for AI to request your feedback when needed</li>
                </ul>
              </div>

              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500">
                    This panel will show interaction options when the AI needs
                    your input
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  const getTitle = () => {
    switch (requestType) {
      case "improve_basic_input":
        return "AI Suggestion - Improve Input";
      case "user_feedback":
        return "AI Analysis - Your Feedback Needed";
      case "analysis_complete":
        return "Analysis Complete";
      case "finish":
        return "Analysis Complete";
      default:
        return "User Interaction Required";
    }
  };

  const getDescription = () => {
    switch (requestType) {
      case "improve_basic_input":
        return "The AI suggests improving your input for better analysis results.";
      case "user_feedback":
        return "The AI has analyzed a file. Please review and provide your feedback.";
      case "analysis_complete":
        return "The analysis has been completed. You can review the results or provide additional feedback.";
      case "finish":
        return "The analysis has been completed successfully. You can review the results.";
      default:
        return "Please provide the requested information.";
    }
  };

  // Render feedback mode form for reject/refine actions
  if (feedbackMode) {
    return (
      <Card className="border-blue-200 bg-blue-50 h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="text-blue-800">
            {feedbackMode === "reject"
              ? "🚫 Reject Analysis"
              : "✏️ Refine Analysis"}
          </CardTitle>
          <p className="text-sm text-blue-700">
            {feedbackMode === "reject"
              ? "Please explain why you reject this analysis:"
              : "Please provide your refined understanding:"}
          </p>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 pr-6">
              {requestData?.message && (
                <div className="mb-4 p-3 bg-white rounded-md border">
                  <p className="text-sm font-medium text-gray-700">
                    Current AI Analysis:
                  </p>
                  <Markdown className="text-sm text-gray-600 mt-1">
                    {requestData.message}
                  </Markdown>
                </div>
              )}

              <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="feedback">
                    {feedbackMode === "reject"
                      ? "Rejection Reason"
                      : "Your Refined Understanding"}
                  </Label>
                  <Textarea
                    id="feedback"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder={
                      feedbackMode === "reject"
                        ? "Explain what's incorrect or missing in the analysis..."
                        : "Provide your improved version of the file understanding..."
                    }
                    disabled={disabled}
                    rows={6}
                    required
                  />
                  {feedbackMode === "refine" && requestData?.message && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setResponse(requestData.message)}
                      disabled={disabled}
                      className="mt-2"
                    >
                      Copy AI Analysis as Starting Point
                    </Button>
                  )}
                </div>

                {/* Next File Selection for Refine Mode */}
                {feedbackMode === "refine" && flowStatus?.basic?.files && (
                  <div className="space-y-2">
                    <Label htmlFor="nextFile">
                      Select Next File to Analyze (Optional)
                    </Label>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={open}
                          className="w-full justify-between"
                          disabled={disabled}
                        >
                          {selectedNextFile ? (
                            <span className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {selectedNextFile}
                            </span>
                          ) : (
                            "Let AI choose the next file (default)"
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search files..." />
                          <CommandList>
                            <CommandEmpty>No files found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setSelectedNextFile("");
                                  setOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedNextFile === ""
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                Let AI choose (default)
                              </CommandItem>
                              {flowStatus.basic.files
                                .filter((file) => file.status === "pending")
                                .filter(
                                  (file) =>
                                    file.path !== flowStatus?.currentFile?.name
                                )
                                .map((file) => (
                                  <CommandItem
                                    key={file.path}
                                    value={file.path}
                                    onSelect={(currentValue) => {
                                      setSelectedNextFile(
                                        currentValue === selectedNextFile
                                          ? ""
                                          : currentValue
                                      );
                                      setOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        selectedNextFile === file.path
                                          ? "opacity-100"
                                          : "opacity-0"
                                      )}
                                    />
                                    <FileText className="mr-2 h-4 w-4" />
                                    {file.path}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-gray-500">
                      {
                        flowStatus.basic.files
                          .filter((f) => f.status === "pending")
                          .filter(
                            (f) => f.path !== flowStatus?.currentFile?.name
                          ).length
                      }{" "}
                      pending files available
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="submit" disabled={disabled || !response.trim()}>
                    Submit{" "}
                    {feedbackMode === "reject" ? "Rejection" : "Refinement"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFeedbackMode(null);
                      setResponse("");
                      setSelectedNextFile("");
                      setOpen(false);
                    }}
                    disabled={disabled}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50 h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="text-orange-800">{getTitle()}</CardTitle>
        <p className="text-sm text-orange-700">{getDescription()}</p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 pr-6">
            {requestData?.currentFile && (
              <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="text-sm font-medium text-blue-700">
                  Current File: {requestData.currentFile}
                </p>
              </div>
            )}

            {requestData?.message && (
              <div className="mb-4 p-3 bg-white rounded-md border">
                <p className="text-sm font-medium text-gray-700">
                  {requestType === "user_feedback"
                    ? "AI Analysis:"
                    : "AI Message:"}
                </p>
                <Markdown className="text-sm text-gray-600 mt-1">
                  {requestData.message}
                </Markdown>
              </div>
            )}

            {requestData?.nextFile && (
              <div className="mb-4 p-3 bg-purple-50 rounded-md border border-purple-200">
                <p className="text-sm font-medium text-purple-700">
                  Next File: {requestData.nextFile.name}
                </p>
                <p className="text-xs text-purple-500 mt-1">
                  {requestData.nextFile.reason}
                </p>
              </div>
            )}

            {requestData?.suggestion && (
              <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="text-sm font-medium text-blue-700">Suggestion:</p>
                <p className="text-sm text-blue-600 mt-1">
                  {requestData.suggestion}
                </p>
              </div>
            )}

            {/* User Feedback Mode - Three Action Buttons */}
            {requestType === "user_feedback" && (
              <div className="space-y-4">
                <div className="text-sm text-gray-700 mb-3">
                  Choose your feedback action:
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <Button
                    onClick={() => handleFeedbackAction("accept")}
                    disabled={disabled}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                    <span className="text-xs ml-2 opacity-80">
                      (Analysis is correct)
                    </span>
                  </Button>

                  <Button
                    onClick={() => handleFeedbackAction("refine")}
                    disabled={disabled}
                    variant="outline"
                    className="w-full border-blue-500 text-blue-700 hover:bg-blue-50"
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    Refine
                    <span className="text-xs ml-2 opacity-80">
                      (Provide improved version)
                    </span>
                  </Button>

                  <Button
                    onClick={() => handleFeedbackAction("reject")}
                    disabled={disabled}
                    variant="outline"
                    className="w-full border-red-500 text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                    <span className="text-xs ml-2 opacity-80">
                      (Analysis is incorrect)
                    </span>
                  </Button>

                  <div className="border-t pt-3 mt-2">
                    <Button
                      onClick={() => handleFeedbackAction("finish")}
                      disabled={disabled}
                      variant="outline"
                      className="w-full border-purple-500 text-purple-700 hover:bg-purple-50"
                    >
                      🏁 Finish Analysis
                      <span className="text-xs ml-2 opacity-80">
                        (Generate summary now)
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Generic Response Form for other request types */}
            {requestType !== "user_feedback" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="response">Your Response</Label>
                  <Textarea
                    id="response"
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder={
                      requestType === "analysis_complete" ||
                      requestType === "finish"
                        ? "Any additional feedback or questions? (optional)"
                        : "Please provide your response..."
                    }
                    disabled={disabled}
                    rows={4}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={disabled}>
                    Send Response
                  </Button>

                  {(requestType === "analysis_complete" ||
                    requestType === "finish") && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleContinue}
                      disabled={disabled}
                    >
                      {requestType === "finish"
                        ? "Acknowledge"
                        : "Continue Analysis"}
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
