import type { WebSocket, WebSocketServer } from "ws";

export interface ObsidianState {
  server?: WebSocketServer;
  connections: Map<string, WebSocket>;
  token?: string;
}

export interface ObsidianMessage {
  type: "message";
  id?: string;
  text: string;
  context?: {
    filePath: string;
    fileName: string;
    content: string;
  } | null;
}

export interface ObsidianReply {
  type: "reply";
  id?: string;
  text: string;
}
