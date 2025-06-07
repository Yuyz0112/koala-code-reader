import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { RequestType } from "@/types";

interface InteractionPanelProps {
  requestType: RequestType;
  requestData: any;
  onSendResponse: (response: any) => void;
  onClearRequest: () => void;
  disabled?: boolean;
}

export function InteractionPanel({
  requestType,
  requestData,
  onSendResponse,
  onClearRequest,
  disabled = false,
}: InteractionPanelProps) {
  const [response, setResponse] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (response.trim()) {
      onSendResponse({
        type: requestType,
        response: response.trim(),
        originalData: requestData,
      });
      setResponse("");
      onClearRequest();
    }
  };

  const handleContinue = () => {
    onSendResponse({
      type: "continue",
      originalData: requestData,
    });
    onClearRequest();
  };

  if (!requestType) {
    return null;
  }

  const getTitle = () => {
    switch (requestType) {
      case "improve_basic_input":
        return "AI Suggestion - Improve Input";
      case "user_feedback":
        return "AI Question - Feedback Needed";
      case "analysis_complete":
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
        return "The AI has a question about the analysis and needs your input.";
      case "analysis_complete":
        return "The analysis has been completed. You can review the results or provide additional feedback.";
      default:
        return "Please provide the requested information.";
    }
  };

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="text-orange-800">{getTitle()}</CardTitle>
        <p className="text-sm text-orange-700">{getDescription()}</p>
      </CardHeader>
      <CardContent>
        {requestData?.message && (
          <div className="mb-4 p-3 bg-white rounded-md border">
            <p className="text-sm font-medium text-gray-700">AI Message:</p>
            <p className="text-sm text-gray-600 mt-1">{requestData.message}</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="response">Your Response</Label>
            <Textarea
              id="response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={
                requestType === "analysis_complete"
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

            {requestType === "analysis_complete" && (
              <Button
                type="button"
                variant="outline"
                onClick={handleContinue}
                disabled={disabled}
              >
                Continue Analysis
              </Button>
            )}

            <Button
              type="button"
              variant="destructive"
              onClick={onClearRequest}
              disabled={disabled}
            >
              Dismiss
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
