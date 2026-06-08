import { ItemView, WorkspaceLeaf, MarkdownRenderer } from "obsidian";
import type ColaPlugin from "./main";
import { ICON_COPY, ICON_CHECK, ICON_SEND, ICON_PAPERCLIP, ICON_FILE, ICON_STOP, ICON_INSERT } from "./icons";

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
  private contextToggle!: HTMLElement;
  private contextEnabled = true;
  private isLoading = false;
  private quoteEl!: HTMLElement;
  private quotedText: string | null = null;

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
    const headerLeft = header.createEl("div", { cls: "cola-header-left" });
    headerLeft.createEl("span", { text: "Cola", cls: "cola-header-title" });
    this.statusEl = headerLeft.createEl("span", { cls: "cola-status" });
    this.updateStatus(this.plugin.gateway.isConnected);

    // File context bar
    const fileBar = container.createEl("div", { cls: "cola-file-bar" });
    this.fileInfoEl = fileBar.createEl("span", { cls: "cola-file-info" });
    this.contextToggle = fileBar.createEl("span", {
      cls: "cola-context-toggle cola-context-on",
      attr: { title: "点击切换：是否附带当前文件内容" },
    });
    this.contextToggle.innerHTML = `${ICON_PAPERCLIP} <span class="cola-context-label">附带文件</span>`;
    this.contextToggle.addEventListener("click", () => {
      this.contextEnabled = !this.contextEnabled;
      const label = this.contextToggle.querySelector(".cola-context-label");
      if (label) label.textContent = this.contextEnabled ? "附带文件" : "不附带";
      this.contextToggle.toggleClass("cola-context-on", this.contextEnabled);
      this.contextToggle.toggleClass("cola-context-off", !this.contextEnabled);
    });
    this.updateFileInfo();

    // Chat messages area
    this.chatContainer = container.createEl("div", { cls: "cola-messages" });

    // Input area
    const inputArea = container.createEl("div", { cls: "cola-input-area" });

    // Quote block (hidden by default)
    this.quoteEl = inputArea.createEl("div", { cls: "cola-quote-block cola-hidden" });

    const inputWrapper = inputArea.createEl("div", { cls: "cola-input-wrapper" });
    this.inputEl = inputWrapper.createEl("textarea", {
      attr: { placeholder: "输入消息...", rows: "1" },
      cls: "cola-input",
    });
    this.sendBtn = inputWrapper.createEl("button", {
      cls: "cola-send-btn cola-send-btn-inactive",
    });
    this.sendBtn.innerHTML = ICON_SEND;

    // Input auto-resize
    this.inputEl.addEventListener("input", () => {
      this.inputEl.style.height = "auto";
      const newHeight = Math.min(this.inputEl.scrollHeight, 120);
      this.inputEl.style.height = newHeight + "px";
      this.updateSendBtnState();
    });

    // Event listeners
    this.sendBtn.addEventListener("click", () => {
      if (this.isLoading) return; // No action during loading
      this.handleSend();
    });
    this.inputEl.addEventListener("keydown", (e) => {
      // Ignore Enter during IME composition (Chinese/Japanese input)
      if (e.isComposing || e.keyCode === 229) return;

      const shortcut = this.plugin.settings.sendShortcut;
      if (shortcut === "ctrl+enter") {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          this.handleSend();
        }
      } else {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      }
    });

    // Listen for file changes
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.updateFileInfo())
    );

    // Listen for Cola messages
    this.plugin.gateway.onMessage((text, actions) => {
      this.addMessage("assistant", text);
      this.setLoading(false);

      // Execute any actions from Cola
      if (actions && actions.length > 0) {
        for (const action of actions) {
          this.plugin.executeAction(action);
        }
      }
    });

    // Listen for connection status
    this.plugin.gateway.onStatus((connected, message) => {
      this.updateStatus(connected, message);
    });

    // Restore saved messages
    this.loadMessages();
  }

  async onClose() {
    this.saveMessages();
  }

  clearChat() {
    this.messages = [];
    this.chatContainer.empty();
    this.saveMessages();
  }

  /** Send text directly as a message (from selection command) */
  sendText(text: string) {
    if (this.isLoading) {
      // Queue in input box if busy
      this.fillInput(text);
      return;
    }
    const context = this.contextEnabled ? null : null; // Don't attach file context for selection sends
    const sent = this.plugin.gateway.send(text, null);
    if (!sent) return;
    this.addMessage("user", text);
    this.setLoading(true);
  }

  /** Fill input box with text (user can edit before sending) */
  fillInput(text: string) {
    this.inputEl.value = text;
    this.inputEl.style.height = "auto";
    const newHeight = Math.min(this.inputEl.scrollHeight, 120);
    this.inputEl.style.height = newHeight + "px";
    this.inputEl.focus();
    this.updateSendBtnState();
  }

  /** Show selected text as a quote reference above input */
  quoteSelection(text: string) {
    this.quotedText = text;
    this.quoteEl.empty();
    const quoteContent = this.quoteEl.createEl("div", { cls: "cola-quote-content" });
    quoteContent.setText(text);
    const dismissBtn = this.quoteEl.createEl("span", { cls: "cola-quote-dismiss", text: "×" });
    dismissBtn.addEventListener("click", () => this.clearQuote());
    this.quoteEl.removeClass("cola-hidden");
    this.inputEl.focus();
    this.inputEl.setAttribute("placeholder", "针对引用内容提问...");
    this.updateSendBtnState();
  }

  private clearQuote() {
    this.quotedText = null;
    this.quoteEl.addClass("cola-hidden");
    this.quoteEl.empty();
    this.inputEl.setAttribute("placeholder", "输入消息...");
  }

  private async handleSend() {
    const text = this.inputEl.value.trim();
    if ((!text && !this.quotedText) || this.isLoading) return;

    // Build the message: if there's a quote, prepend it
    let messageToSend = text;
    let displayMessage = text;
    if (this.quotedText) {
      const quoted = this.quotedText;
      messageToSend = `> ${quoted.replace(/\n/g, "\n> ")}\n\n${text}`;
      displayMessage = messageToSend;
      this.clearQuote();
    }

    if (!messageToSend.trim()) return;

    const context = this.contextEnabled ? await this.getFileContext() : null;
    const sent = this.plugin.gateway.send(messageToSend, context);
    if (!sent) return;

    this.inputEl.value = "";
    this.inputEl.style.height = "auto";
    this.addMessage("user", displayMessage);
    this.setLoading(true);
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
      return { filePath: file.path, fileName: file.basename, content: content.slice(0, 10000) };
    } catch {
      return null;
    }
  }

  private addMessage(role: "user" | "assistant", content: string) {
    this.messages.push({ role, content, timestamp: Date.now() });
    this.renderMessage(role, content);
    this.saveMessages();
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  private renderMessage(role: "user" | "assistant", content: string) {
    const msgWrapper = this.chatContainer.createEl("div", {
      cls: `cola-msg-wrapper cola-msg-wrapper-${role}`,
    });

    const msgEl = msgWrapper.createEl("div", {
      cls: `cola-msg cola-msg-${role}`,
    });

    const contentEl = msgEl.createEl("div", { cls: "cola-msg-content" });

    if (role === "assistant") {
      // Render Markdown for assistant
      MarkdownRenderer.render(this.app, content, contentEl, "", this);

      // Add copy buttons to code blocks
      const codeBlocks = contentEl.querySelectorAll("pre > code");
      codeBlocks.forEach((codeEl) => {
        const pre = codeEl.parentElement;
        if (!pre) return;
        pre.addClass("cola-code-block");
        const copyBtn = pre.createEl("button", { cls: "cola-code-copy-btn" });
        copyBtn.innerHTML = ICON_COPY;
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(codeEl.textContent || "");
          copyBtn.innerHTML = ICON_CHECK;
          setTimeout(() => { copyBtn.innerHTML = ICON_COPY; }, 1500);
        });
      });
    } else {
      // Plain text for user messages
      contentEl.setText(content);
    }

    // Message action buttons
    const msgActions = msgWrapper.createEl("div", { cls: "cola-msg-actions" });

    // Copy button
    const copyMsgBtn = msgActions.createEl("button", {
      cls: "cola-msg-action-btn",
      attr: { title: "复制" },
    });
    copyMsgBtn.innerHTML = ICON_COPY;
    copyMsgBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      copyMsgBtn.innerHTML = ICON_CHECK;
      setTimeout(() => { copyMsgBtn.innerHTML = ICON_COPY; }, 1500);
    });

    // Insert button (assistant messages only)
    if (role === "assistant") {
      const insertBtn = msgActions.createEl("button", {
        cls: "cola-msg-action-btn",
        attr: { title: "插入到编辑器" },
      });
      insertBtn.innerHTML = ICON_INSERT;
      insertBtn.addEventListener("click", () => {
        this.plugin.insertAtCursor(content);
        insertBtn.innerHTML = ICON_CHECK;
        setTimeout(() => { insertBtn.innerHTML = ICON_INSERT; }, 1500);
      });
    }
  }

  private setLoading(loading: boolean) {
    this.isLoading = loading;

    if (loading) {
      this.sendBtn.innerHTML = ICON_STOP;
      this.sendBtn.addClass("cola-send-btn-loading");
      this.sendBtn.removeClass("cola-send-btn-inactive");
      this.sendBtn.disabled = true;

      const existing = this.chatContainer.querySelector(".cola-typing");
      if (!existing) {
        const typingEl = this.chatContainer.createEl("div", { cls: "cola-typing" });
        typingEl.setText("Cola 正在思考...");
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      }
    } else {
      this.sendBtn.removeClass("cola-send-btn-loading");
      this.updateSendBtnState();

      const typingEl = this.chatContainer.querySelector(".cola-typing");
      if (typingEl) typingEl.remove();
    }
  }

  private updateSendBtnState() {
    if (this.isLoading) return;
    const hasContent = this.inputEl.value.trim().length > 0 || this.quotedText !== null;
    this.sendBtn.innerHTML = ICON_SEND;
    this.sendBtn.disabled = !hasContent;
    this.sendBtn.toggleClass("cola-send-btn-inactive", !hasContent);
    this.sendBtn.toggleClass("cola-send-btn-loading", false);
  }

  private updateFileInfo() {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      this.fileInfoEl.innerHTML = `${ICON_FILE} ${file.basename}`;
      this.fileInfoEl.title = file.path;
    } else {
      this.fileInfoEl.setText("无打开文件");
    }
  }

  private updateStatus(connected: boolean, message?: string) {
    if (connected) {
      this.statusEl.setText("●");
      this.statusEl.title = "已连接";
    } else {
      this.statusEl.setText("○");
      this.statusEl.title = message || "未连接";
    }
    this.statusEl.toggleClass("cola-status-connected", connected);
    this.statusEl.toggleClass("cola-status-disconnected", !connected);
  }

  private saveMessages() {
    this.plugin.saveData({ messages: this.messages, settings: this.plugin.settings });
  }

  private async loadMessages() {
    try {
      const data = await this.plugin.loadData();
      if (data?.messages && Array.isArray(data.messages)) {
        this.messages = data.messages;
        for (const msg of this.messages) {
          this.renderMessage(msg.role, msg.content);
        }
        setTimeout(() => {
          this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }, 50);
      }
    } catch {}
  }
}
