import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { RequestType } from "@/types";
import { CheckCircle, XCircle, Edit3 } from "lucide-react";
import { Markdown } from "@/components/Markdown";

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
        summary: string;
      };
    };
    nextFile?: {
      name: string;
      reason: string;
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

  const handleFeedbackAction = (action: "accept" | "reject" | "refine") => {
    if (action === "accept") {
      // For accept, send the feedback directly without requiring additional input
      onSendResponse({
        type: "user_feedback",
        action: "accept",
        reason: "User approved the analysis",
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
      feedbackData.userSummary = response.trim();
      feedbackData.reason = "User provided refined summary";
    }

    onSendResponse(feedbackData);
    setResponse("");
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
        <Card className="border-green-200 bg-green-50 h-full">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center gap-2">
              AI Assistant Status
            </CardTitle>
            <p className="text-sm text-green-700">
              Your repository analysis has been completed successfully
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm text-green-700">
              <div className="p-3 bg-white rounded-md border border-green-200">
                <ul className="space-y-1 text-green-600">
                  <li>• All repository files have been analyzed</li>
                  <li>• Summaries and insights have been generated</li>
                  <li>• Results are ready for review</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-gray-200 bg-gray-50 h-full">
        <CardHeader>
          <CardTitle className="text-gray-800 flex items-center gap-2">
            AI Assistant Status
          </CardTitle>
          <p className="text-sm text-gray-600">
            The AI is currently working on your analysis
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="p-3 bg-white rounded-md border border-gray-200">
              <p className="font-medium text-gray-800 mb-2">
                What's happening now:
              </p>
              <ul className="space-y-1 text-gray-600">
                <li>• AI is analyzing your repository files</li>
                <li>• Processing code structure and patterns</li>
                <li>• Generating summaries and insights</li>
              </ul>
            </div>

            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <p className="font-medium text-blue-800 mb-2">
                💡 What you can do:
              </p>
              <ul className="space-y-1 text-blue-700">
                <li>• Monitor progress in the Analysis Progress panel</li>
                <li>
                  • View current file being analyzed in the Current File tab
                </li>
                <li>• Check completed summaries in the File Summaries tab</li>
                <li>• Wait for AI to request your feedback when needed</li>
              </ul>
            </div>

            <div className="p-3 bg-green-50 rounded-md border border-green-200">
              <p className="font-medium text-green-800 mb-2">
                🎯 Feedback modes you might see:
              </p>
              <ul className="space-y-1 text-green-700">
                <li>
                  • <strong>Approve:</strong> Confirm AI analysis is correct
                </li>
                <li>
                  • <strong>Refine:</strong> Provide improved version of
                  analysis
                </li>
                <li>
                  • <strong>Reject:</strong> Explain why analysis is incorrect
                </li>
              </ul>
            </div>

            <div className="text-center py-2">
              <p className="text-xs text-gray-500 italic">
                This panel will show interaction options when the AI needs your
                input
              </p>
            </div>
          </div>
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
      <Card className="border-blue-200 bg-blue-50 h-full">
        <CardHeader>
          <CardTitle className="text-blue-800">
            {feedbackMode === "reject"
              ? "🚫 Reject Analysis"
              : "✏️ Refine Analysis"}
          </CardTitle>
          <p className="text-sm text-blue-700">
            {feedbackMode === "reject"
              ? "Please explain why you reject this analysis:"
              : "Please provide your refined summary:"}
          </p>
        </CardHeader>
        <CardContent>
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
                  : "Your Refined Summary"}
              </Label>
              <Textarea
                id="feedback"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder={
                  feedbackMode === "reject"
                    ? "Explain what's incorrect or missing in the analysis..."
                    : "Provide your improved version of the file analysis..."
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

            <div className="flex gap-2">
              <Button type="submit" disabled={disabled || !response.trim()}>
                Submit {feedbackMode === "reject" ? "Rejection" : "Refinement"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFeedbackMode(null);
                  setResponse("");
                }}
                disabled={disabled}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-orange-200 bg-orange-50 h-full">
      <CardHeader>
        <CardTitle className="text-orange-800">{getTitle()}</CardTitle>
        <p className="text-sm text-orange-700">{getDescription()}</p>
      </CardHeader>
      <CardContent>
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
              {requestType === "user_feedback" ? "AI Analysis:" : "AI Message:"}
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

        {requestData?.results && (
          <div className="mb-4 p-3 bg-green-50 rounded-md border border-green-200">
            <p className="text-sm font-medium text-green-700">
              Analysis Results:
            </p>
            <pre className="text-xs text-green-600 mt-1 whitespace-pre-wrap">
              {JSON.stringify(requestData.results, null, 2)}
            </pre>
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
      </CardContent>
    </Card>
  );
}
