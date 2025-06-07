import { useState, useEffect, useRef, useCallback } from "react";
import { ConnectionStatus, WebSocketMessage, RequestType } from "@/types";

export const useWebSocket = () => {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<string[]>([]);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [currentRequestType, setCurrentRequestType] =
    useState<RequestType>(null);
  const [currentRequestData, setCurrentRequestData] = useState<any>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const addMessage = useCallback((message: string) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus("connecting");
    addMessage("🔌 Connecting to server...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      addMessage("✅ Connected to server");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      addMessage("❌ Disconnected from server");
      wsRef.current = null;
    };

    ws.onerror = () => {
      setStatus("error");
      addMessage("❌ Connection error");
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
        addMessage("❌ Invalid message format received");
      }
    };
  }, [addMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
    setAnalysisStarted(false);
    setCurrentRequestType(null);
    setCurrentRequestData(null);
  }, []);

  const sendMessage = useCallback(
    (data: any) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(data));
      } else {
        addMessage("❌ Not connected to server");
      }
    },
    [addMessage]
  );

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case "analysis_started":
          setAnalysisStarted(true);
          addMessage("🚀 Analysis started");
          break;

        case "file_analysis":
          addMessage(`📄 Analyzing: ${message.data.fileName}`);
          break;

        case "file_summary":
          addMessage(`✅ Completed: ${message.data.fileName}`);
          break;

        case "analysis_complete":
          addMessage("🎉 Analysis complete! Check the results tab.");
          setCurrentRequestType("analysis_complete");
          setCurrentRequestData(message.data);
          break;

        case "improve_basic_input":
          addMessage(
            "💡 AI suggests improving the input. Please review and update."
          );
          setCurrentRequestType("improve_basic_input");
          setCurrentRequestData(message.data);
          break;

        case "user_feedback":
          addMessage(
            "❓ AI has a question about the analysis. Please provide feedback."
          );
          setCurrentRequestType("user_feedback");
          setCurrentRequestData(message.data);
          break;

        case "history_reduced":
          addMessage("🗜️ Analysis history has been condensed to save memory.");
          break;

        case "error":
          addMessage(`❌ Error: ${message.error}`);
          break;

        default:
          console.log("Unknown message type:", message.type);
      }
    },
    [addMessage]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
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
  };
};
