import { useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessagesPanelProps {
  messages: string[];
}

export function MessagesPanel({ messages }: MessagesPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle>Analysis Progress</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full w-full px-6 pb-6">
          <div className="space-y-2 pt-6">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No messages yet. Start an analysis to see progress here.
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
