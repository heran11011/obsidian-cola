import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Notice } from "obsidian";
import type ColaPlugin from "./main";

const TOKEN_PATH = join(homedir(), ".cola", "plugins", "obsidian", "local-token");
const DEFAULT_PORT = 19533;

export type MessageHandler = (text: string) => void;
export type StatusHandler = (connected: boolean, message?: string) => void;

export class ColaGateway {
  private ws: WebSocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private statusHandler: StatusHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private port: number = DEFAULT_PORT;
  private intentionalClose = false;
  private reconnectAttempts = 0;

  constructor(private plugin: ColaPlugin) {}

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    this.intentionalClose = false;
    try {
      // Always re-read token on connect (fixes token change after Cola restart)
      const token = this.readToken();
      if (!token) {
        this.notifyStatus(false, "找不到连接凭证");
        return;
      }

      const url = `ws://127.0.0.1:${this.port}?token=${token}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("[Cola] Connected to Cola");
        this.reconnectAttempts = 0;
        this.notifyStatus(true);
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

      this.ws.onclose = (event) => {
        this.ws = null;
        if (!this.intentionalClose) {
          const reason = event.code === 4001 ? "认证失败，正在重试..." : "连接断开，正在重连...";
          this.notifyStatus(false, reason);
          console.log("[Cola] Disconnected, will retry...");
          this.scheduleReconnect();
        } else {
          this.notifyStatus(false);
        }
      };

      this.ws.onerror = () => {
        // Error is followed by close event, no need to handle separately
      };
    } catch (e) {
      console.error("[Cola] Failed to connect:", e);
      this.notifyStatus(false, "连接失败");
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

  send(text: string, context: { filePath: string; fileName: string; content: string } | null): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      new Notice("Cola 未连接，请确认 Cola 已启动");
      return false;
    }

    this.ws.send(
      JSON.stringify({
        type: "message",
        text,
        context,
      })
    );
    return true;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  onStatus(handler: StatusHandler) {
    this.statusHandler = handler;
  }

  private notifyStatus(connected: boolean, message?: string) {
    if (this.statusHandler) {
      this.statusHandler(connected, message);
    }
  }

  private readToken(): string | null {
    try {
      return readFileSync(TOKEN_PATH, "utf-8").trim();
    } catch {
      console.warn("[Cola] Cannot read token file:", TOKEN_PATH);
      return null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.intentionalClose) return;
    this.reconnectAttempts++;
    // Exponential backoff: 3s, 6s, 12s, max 30s
    const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
