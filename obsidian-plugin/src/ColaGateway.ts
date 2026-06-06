import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Notice } from "obsidian";
import type ColaPlugin from "./main";

const TOKEN_PATH = join(homedir(), ".cola", "plugins", "obsidian", "local-token");
const DEFAULT_PORT = 19533;

export type MessageHandler = (text: string) => void;
export type StatusHandler = (connected: boolean) => void;

export class ColaGateway {
  private ws: WebSocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private port: number = DEFAULT_PORT;
  private intentionalClose = false;

  constructor(private plugin: ColaPlugin) {}

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    this.intentionalClose = false;
    try {
      const token = this.readToken();
      if (!token) {
        this.notifyStatus(false);
        return;
      }

      const url = `ws://127.0.0.1:${this.port}?token=${token}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[Cola] Connected to Cola");
        this.notifyStatus(true);
        // Clear reconnect timer on success
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));

          if (data.type === "connected") {
            console.log("[Cola] Authenticated, connId:", data.connId);
            return;
          }

          if (data.type === "reply" && this.messageHandler) {
            this.messageHandler(data.text);
          }
        } catch (e) {
          console.error("[Cola] Failed to parse message:", e);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.notifyStatus(false);
        if (!this.intentionalClose) {
          console.log("[Cola] Disconnected, will retry in 5s...");
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error("[Cola] WebSocket error:", err);
      };
    } catch (e) {
      console.error("[Cola] Failed to connect:", e);
      this.notifyStatus(false);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus(false);
  }

  send(text: string, context: { filePath: string; fileName: string; content: string } | null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      new Notice("Cola 未连接，请确认 Cola 已启动");
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: "message",
        text,
        context,
      })
    );
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  onStatus(handler: StatusHandler) {
    this.statusHandler = handler;
  }

  private notifyStatus(connected: boolean) {
    if (this.statusHandler) {
      this.statusHandler(connected);
    }
  }

  private readToken(): string | null {
    try {
      return readFileSync(TOKEN_PATH, "utf-8").trim();
    } catch {
      console.warn("[Cola] Cannot read token file:", TOKEN_PATH);
      new Notice("找不到 Cola 连接凭证，请确认 Cola 已安装 Obsidian 插件");
      return null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalClose) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }
}
