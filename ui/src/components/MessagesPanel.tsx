import { useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessagesPanelProps {
  messages: string[];
  status: string;
}

export function MessagesPanel({ messages, status }: MessagesPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "text-green-600";
      case "connecting":
        return "text-yellow-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Connection Error";
      default:
        return "Unknown";
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Analysis Progress</CardTitle>
          <div className={`text-sm font-medium ${getStatusColor(status)}`}>
            {getStatusText(status)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[calc(100%-80px)]">
        <ScrollArea className="h-full w-full">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No messages yet. Connect to start the analysis.
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className="p-2 rounded-md bg-gray-50 text-sm font-mono"
                >
                  {message}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
