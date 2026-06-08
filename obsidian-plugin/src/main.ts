import { Plugin, PluginSettingTab, Setting, App, Notice, MarkdownView, TFile, TFolder } from "obsidian";
import { ColaView, VIEW_TYPE_COLA } from "./ColaView";
import { ColaGateway } from "./ColaGateway";

interface ColaSettings {
  sendShortcut: "ctrl+enter" | "enter";
}

const DEFAULT_SETTINGS: ColaSettings = {
  sendShortcut: "ctrl+enter",
};

export default class ColaPlugin extends Plugin {
  gateway!: ColaGateway;
  settings!: ColaSettings;

  async onload() {
    await this.loadSettings();
    this.gateway = new ColaGateway(this);

    this.registerView(VIEW_TYPE_COLA, (leaf) => new ColaView(leaf, this));

    this.addRibbonIcon("message-circle", "Open Cola", () => {
      this.activateView();
    });

    // Command: Open Cola Chat
    this.addCommand({
      id: "open-cola-chat",
      name: "打开 Cola 对话",
      callback: () => this.activateView(),
    });

    // Command: Quote selection to Cola (like VS Code inline chat)
    this.addCommand({
      id: "quote-selection-to-cola",
      name: "引用选中文本到 Cola",
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice("没有选中文本");
          return;
        }
        this.quoteSelectionToCola(selection);
      },
    });

    // Command: Send selection directly
    this.addCommand({
      id: "send-selection-to-cola",
      name: "将选中文本直接发送给 Cola",
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection) {
          new Notice("没有选中文本");
          return;
        }
        this.sendSelectionToCola(selection);
      },
    });

    this.addSettingTab(new ColaSettingTab(this.app, this));

    // When connected, send vault file list
    this.gateway.onConnected(() => {
      this.sendVaultInfo();
    });

    this.gateway.connect();
  }

  async onunload() {
    this.gateway.disconnect();
  }

  async activateView(): Promise<ColaView | null> {
    const { workspace } = this.app;
    let leaves = workspace.getLeavesOfType(VIEW_TYPE_COLA);

    if (leaves.length === 0) {
      const leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_COLA, active: true });
        workspace.revealLeaf(leaf);
        leaves = workspace.getLeavesOfType(VIEW_TYPE_COLA);
      }
    } else {
      workspace.revealLeaf(leaves[0]);
    }

    if (leaves.length > 0 && leaves[0].view instanceof ColaView) {
      return leaves[0].view as ColaView;
    }
    return null;
  }

  /** Quote selection in Cola sidebar (user adds question below) */
  async quoteSelectionToCola(text: string) {
    const view = await this.activateView();
    if (view) {
      view.quoteSelection(text);
    }
  }

  /** Send selection directly to Cola as a message */
  async sendSelectionToCola(text: string) {
    const view = await this.activateView();
    if (view) {
      view.sendText(text);
    }
  }

  /** Insert text at cursor in the most recent markdown editor */
  insertAtCursor(text: string) {
    // Find the most recent MarkdownView (not necessarily active, since user clicked sidebar)
    let mdView: MarkdownView | null = null;

    // Try active first
    mdView = this.app.workspace.getActiveViewOfType(MarkdownView);

    // If not found, search all leaves for most recent markdown editor
    if (!mdView) {
      const leaves = this.app.workspace.getLeavesOfType("markdown");
      if (leaves.length > 0) {
        // Get the most recently active one
        const leaf = leaves[leaves.length - 1];
        if (leaf.view instanceof MarkdownView) {
          mdView = leaf.view;
        }
      }
    }

    if (!mdView) {
      new Notice("没有打开的编辑器，请先打开一个 Markdown 文件");
      return;
    }

    const editor = mdView.editor;
    const cursor = editor.getCursor();
    editor.replaceRange(text, cursor);
    const lines = text.split("\n");
    const lastLine = lines[lines.length - 1];
    if (lines.length === 1) {
      editor.setCursor({ line: cursor.line, ch: cursor.ch + lastLine.length });
    } else {
      editor.setCursor({ line: cursor.line + lines.length - 1, ch: lastLine.length });
    }
    // Focus the editor after insert
    this.app.workspace.revealLeaf(mdView.leaf);
    new Notice("已插入");
  }

  /** Send vault file structure to Cola */
  sendVaultInfo() {
    const files: string[] = [];
    const walkFolder = (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
          files.push(child.path);
        } else if (child instanceof TFolder) {
          walkFolder(child);
        }
      }
    };
    walkFolder(this.app.vault.getRoot());

    // Limit to 500 files to avoid overwhelming
    const limited = files.slice(0, 500);
    const vaultName = this.app.vault.getName();
    this.gateway.sendVaultInfo(vaultName, limited);
  }

  /** Execute a Cola action on the vault */
  async executeAction(action: { type: string; path?: string; content?: string; query?: string }) {
    switch (action.type) {
      case "openFile": {
        if (!action.path) return;
        const file = this.app.vault.getAbstractFileByPath(action.path);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf();
          await leaf.openFile(file);
          this.app.workspace.revealLeaf(leaf);
        } else {
          // Try fuzzy match
          const allFiles = this.app.vault.getFiles();
          const match = allFiles.find(f =>
            f.path.toLowerCase().includes(action.path!.toLowerCase()) ||
            f.basename.toLowerCase().includes(action.path!.toLowerCase())
          );
          if (match) {
            const leaf = this.app.workspace.getLeaf();
            await leaf.openFile(match);
            this.app.workspace.revealLeaf(leaf);
          } else {
            new Notice(`找不到文件: ${action.path}`);
          }
        }
        break;
      }
      case "createFile": {
        if (!action.path) return;
        const content = action.content || "";
        try {
          const newFile = await this.app.vault.create(action.path, content);
          const leaf = this.app.workspace.getLeaf();
          await leaf.openFile(newFile);
          this.app.workspace.revealLeaf(leaf);
          new Notice(`已创建: ${action.path}`);
        } catch (e) {
          new Notice(`创建文件失败: ${action.path}`);
        }
        break;
      }
      case "searchFile": {
        if (!action.query) return;
        const allFiles = this.app.vault.getFiles();
        const query = action.query.toLowerCase();
        const results = allFiles.filter(f =>
          f.path.toLowerCase().includes(query) ||
          f.basename.toLowerCase().includes(query)
        ).slice(0, 5);

        if (results.length === 1) {
          const leaf = this.app.workspace.getLeaf();
          await leaf.openFile(results[0]);
          this.app.workspace.revealLeaf(leaf);
        } else if (results.length > 1) {
          new Notice(`找到 ${results.length} 个文件: ${results.map(f => f.basename).join(", ")}`);
        } else {
          new Notice(`没有找到匹配的文件: ${action.query}`);
        }
        break;
      }
    }
  }

  async clearChatHistory() {
    const data = await this.loadData();
    await this.saveData({ ...data, messages: [] });
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_COLA);
    for (const leaf of leaves) {
      if (leaf.view instanceof ColaView) {
        leaf.view.clearChat();
      }
    }
    new Notice("聊天记录已清除（Cola 的记忆不受影响）");
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});
  }

  async saveSettings() {
    const data = (await this.loadData()) || {};
    data.settings = this.settings;
    await this.saveData(data);
  }
}

class ColaSettingTab extends PluginSettingTab {
  plugin: ColaPlugin;

  constructor(app: App, plugin: ColaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Cola 插件设置" });

    new Setting(containerEl)
      .setName("发送快捷键")
      .setDesc("选择发送消息的快捷键方式")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("ctrl+enter", "Ctrl/Cmd + Enter")
          .addOption("enter", "Enter（Shift+Enter 换行）")
          .setValue(this.plugin.settings.sendShortcut)
          .onChange(async (value) => {
            this.plugin.settings.sendShortcut = value as ColaSettings["sendShortcut"];
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "快捷键" });

    containerEl.createEl("p", {
      text: "所有快捷键均可在 Obsidian 设置 → 快捷键 中搜索 \"Cola\" 进行自定义。",
      cls: "setting-item-description",
    });

    const hotkeyList = containerEl.createEl("div", { cls: "cola-hotkey-list" });
    const commands = [
      { name: "打开 Cola 对话", id: "open-cola-chat" },
      { name: "引用选中文本到 Cola", id: "quote-selection-to-cola" },
      { name: "将选中文本直接发送给 Cola", id: "send-selection-to-cola" },
    ];
    for (const cmd of commands) {
      const item = hotkeyList.createEl("div", { cls: "cola-hotkey-item" });
      item.createEl("span", { text: cmd.name, cls: "cola-hotkey-name" });
      item.createEl("span", { text: `obsidian-cola:${cmd.id}`, cls: "cola-hotkey-id" });
    }

    containerEl.createEl("h3", { text: "数据" });

    new Setting(containerEl)
      .setName("清除聊天记录")
      .setDesc("仅清除 Obsidian 侧边栏中的对话记录。Cola 的记忆和上下文不会受到影响。")
      .addButton((btn) =>
        btn
          .setButtonText("清除")
          .setWarning()
          .onClick(async () => {
            await this.plugin.clearChatHistory();
          })
      );

    new Setting(containerEl)
      .setName("连接状态")
      .setDesc(
        this.plugin.gateway.isConnected
          ? "✅ 已连接到 Cola"
          : "❌ 未连接。请确认 Cola 已启动。"
      );
  }
}
