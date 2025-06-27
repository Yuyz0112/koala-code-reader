import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, RefreshCw, Plus, Play, ExternalLink } from "lucide-react";
import { FlowListItem } from "@/lib/api-client";

interface FlowsListProps {
  flows: FlowListItem[];
  isLoading: boolean;
  onLoadFlows: () => Promise<{
    success: boolean;
    flows?: FlowListItem[];
    error?: string;
  }>;
  onDeleteFlow: (
    runId: string
  ) => Promise<{ success: boolean; error?: string }>;
  onLoadFlow: (runId: string) => Promise<{ success: boolean; error?: string }>;
  onNewFlow: () => void;
}

// Expandable text component for truncated content
const ExpandableText: React.FC<{
  text: string;
  maxLength: number;
  className?: string;
}> = ({ text, maxLength, className = "" }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (text.length <= maxLength) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {isExpanded ? text : `${text.substring(0, maxLength)}...`}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="ml-1 text-blue-600 hover:text-blue-800 text-xs underline"
      >
        {isExpanded ? "show less" : "show more"}
      </button>
    </span>
  );
};

export const FlowsList: React.FC<FlowsListProps> = ({
  flows,
  isLoading,
  onLoadFlows,
  onDeleteFlow,
  onLoadFlow,
  onNewFlow,
}) => {
  useEffect(() => {
    onLoadFlows();
  }, [onLoadFlows]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const handleDeleteFlow = async (runId: string, repoName?: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete the flow for ${repoName || runId}?`
      )
    ) {
      await onDeleteFlow(runId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Koala Code Reader</h1>
        <div className="flex gap-2">
          <Button onClick={onLoadFlows} disabled={isLoading} variant="outline">
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={onNewFlow}>
            <Plus className="h-4 w-4 mr-2" />
            New Analysis
          </Button>
        </div>
      </div>

      {isLoading && flows.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
          Loading flows...
        </div>
      )}

      {!isLoading && flows.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500 mb-4">No analysis flows found</p>
            <Button onClick={onNewFlow}>
              <Plus className="h-4 w-4 mr-2" />
              Start Your First Analysis
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="container grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2">
        {flows.map((flow) => (
          <Card
            key={flow.runId}
            className="transition-shadow hover:shadow-md h-fit"
          >
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">
                    {flow.basic?.repoName || "Unknown Repository"}
                  </CardTitle>
                  <p className="text-sm text-gray-600 break-words">
                    {flow.basic?.mainGoal ? (
                      <ExpandableText
                        text={flow.basic.mainGoal}
                        maxLength={80}
                      />
                    ) : (
                      "No goal specified"
                    )}
                  </p>
                  {flow.basic?.githubUrl && (
                    <a
                      href={flow.basic.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1 truncate"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        {flow.basic.githubUrl.replace(
                          "https://github.com/",
                          ""
                        )}
                      </span>
                    </a>
                  )}
                  {flow.basic?.specificAreas && (
                    <p className="text-xs text-gray-500 break-words">
                      Focus:{" "}
                      <ExpandableText
                        text={flow.basic.specificAreas}
                        maxLength={60}
                      />
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      flow.completed
                        ? "bg-green-100 text-green-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {flow.completed ? "Completed" : "In Progress"}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  <p>{formatDate(flow.createdAt)}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onLoadFlow(flow.runId)}
                    className="text-xs"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {flow.completed ? "View" : "Resume"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleDeleteFlow(flow.runId, flow.basic?.repoName)
                    }
                    className="text-red-600 hover:bg-red-50 text-xs"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
