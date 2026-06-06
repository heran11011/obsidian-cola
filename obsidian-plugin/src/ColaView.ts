import { ItemView, WorkspaceLeaf, MarkdownRenderer, TFile } from "obsidian";
import type ColaPlugin from "./main";

export const VIEW_TYPE_COLA = "cola-chat-view";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export class ColaView extends ItemView {
  private plugin: ColaPlugin;
  private messages: ChatMessage[] = [];
  private chatContainer!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private statusEl!: HTMLElement;
  private fileInfoEl!: HTMLElement;
  private sendBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: ColaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_COLA;
  }

  getDisplayText(): string {
    return "Cola";
  }

  getIcon(): string {
    return "message-circle";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("cola-chat-root");

    // Header
    const header = container.createEl("div", { cls: "cola-header" });
    header.createEl("span", { text: "Cola", cls: "cola-header-title" });
    this.statusEl = header.createEl("span", { cls: "cola-status" });
    this.updateStatus(this.plugin.gateway.isConnected);

    // File context indicator
    this.fileInfoEl = container.createEl("div", { cls: "cola-file-info" });
    this.updateFileInfo();

    // Chat messages area
    this.chatContainer = container.createEl("div", { cls: "cola-messages" });

    // Input area
    const inputArea = container.createEl("div", { cls: "cola-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      attr: {
        placeholder: "和 Cola 说点什么... (Ctrl+Enter 发送)",
        rows: "3",
      },
      cls: "cola-input",
    });
    this.sendBtn = inputArea.createEl("button", {
      text: "发送",
      cls: "cola-send-btn",
    });

    // Event listeners
    this.sendBtn.addEventListener("click", () => this.handleSend());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Listen for file changes
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.updateFileInfo())
    );

    // Listen for Cola messages
    this.plugin.gateway.onMessage((text) => {
      this.addMessage("assistant", text);
      this.setLoading(false);
    });

    // Listen for connection status
    this.plugin.gateway.onStatus((connected) => {
      this.updateStatus(connected);
    });
  }

  async onClose() {
    // Cleanup handled by registerEvent automatically
  }

  private async handleSend() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = "";
    this.addMessage("user", text);
    this.setLoading(true);

    // Get file context
    const context = await this.getFileContext();

    // Send to Cola
    this.plugin.gateway.send(text, context);
  }

  private async getFileContext(): Promise<{
    filePath: string;
    fileName: string;
    content: string;
  } | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;

    try {
      const content = await this.app.vault.cachedRead(file);
      return {
        filePath: file.path,
        fileName: file.basename,
        // Limit content to 10K chars
        content: content.slice(0, 10000),
      };
    } catch {
      return null;
    }
  }

  private addMessage(role: "user" | "assistant", content: string) {
    this.messages.push({ role, content, timestamp: Date.now() });

    const msgEl = this.chatContainer.createEl("div", {
      cls: `cola-msg cola-msg-${role}`,
    });

    if (role === "assistant") {
      // Render markdown for assistant replies
      const contentEl = msgEl.createEl("div", { cls: "cola-msg-content" });
      MarkdownRenderer.render(
        this.app,
        content,
        contentEl,
        "",
        this
      );
    } else {
      // Plain text for user messages
      const contentEl = msgEl.createEl("div", { cls: "cola-msg-content" });
      contentEl.setText(content);
    }

    // Auto-scroll to bottom
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  private setLoading(loading: boolean) {
    this.sendBtn.disabled = loading;
    this.sendBtn.setText(loading ? "..." : "发送");

    if (loading) {
      // Add typing indicator
      const existing = this.chatContainer.querySelector(".cola-typing");
      if (!existing) {
        const typingEl = this.chatContainer.createEl("div", {
          cls: "cola-typing",
        });
        typingEl.setText("Cola 正在思考...");
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    } else {
      // Remove typing indicator
      const typingEl = this.chatContainer.querySelector(".cola-typing");
      if (typingEl) typingEl.remove();
    }
  }

  private updateFileInfo() {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      this.fileInfoEl.setText(`📄 ${file.basename}`);
      this.fileInfoEl.title = file.path;
      this.fileInfoEl.style.display = "block";
    } else {
      this.fileInfoEl.style.display = "none";
    }
  }

  private updateStatus(connected: boolean) {
    this.statusEl.setText(connected ? "● 已连接" : "○ 未连接");
    this.statusEl.toggleClass("cola-status-connected", connected);
    this.statusEl.toggleClass("cola-status-disconnected", !connected);
  }
}
