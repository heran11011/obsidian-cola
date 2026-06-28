# Obsidian-Cola

> Chat with [Cola AI](https://colaos.ai) directly in Obsidian — context-aware sidebar that understands what you're writing.

---

## ✨ Features

- **Sidebar Chat** — AI conversation panel lives in your Obsidian sidebar, no context-switching needed
- **File Context Awareness** — automatically sends the current file/selection as context, so Cola knows what you're working on
- **Markdown Rendering** — responses rendered as rich Markdown with syntax highlighting
- **Paginated History** — chat history loads progressively for smooth performance
- **Search** — find past messages quickly
- **Thinking Animation** — visual feedback while Cola processes your request
- **Quote & Insert** — select text in your note → quote it to Cola → insert Cola's response back into your note
- **Vault Actions** — Cola can open, create, and search files in your vault via structured actions
- **Configurable Shortcuts** — choose between Enter or Ctrl+Enter to send

---

## 🏗 Architecture

```
┌─────────────────────┐          WebSocket           ┌──────────────────────────┐
│  Obsidian Plugin    │ ◄──── ws://127.0.0.1:19533 ────►  Cola Channel Plugin   │
│  (Sidebar UI)       │                              │  (Local WS Server)       │
│                     │    ← messages + actions →     │                          │
│  • ColaView.ts      │                              │  • ctx.deliver() → Cola  │
│  • ColaGateway.ts   │                              │  • outbound.sendText()   │
└─────────────────────┘                              └──────────────────────────┘
                                                              ↕
                                                        Cola AI Agent
                                                     (same memory, separate thread)
```

**Two components, one experience:**

| Component | Role | Tech |
|-----------|------|------|
| `obsidian-plugin/` | Sidebar UI + file context sensing | TypeScript, Obsidian API, esbuild |
| `cola-channel-plugin/` | Local WebSocket server bridging Obsidian ↔ Cola | TypeScript, `ws`, Cola Plugin SDK |

---

## 🚀 Getting Started

### Prerequisites

- [Cola](https://colaos.ai) desktop app installed and running
- Obsidian v1.4+

### Install Obsidian Plugin

1. Clone this repo
2. `cd obsidian-plugin && npm install && npm run build`
3. Copy `obsidian-plugin/` → your vault's `.obsidian/plugins/obsidian-cola/`
4. Enable "Cola" in Obsidian → Settings → Community Plugins

### Install Cola Channel Plugin

1. `cd cola-channel-plugin && npm install && npm run build`
2. Register the plugin in Cola (see Cola plugin docs)

Once both are running, click the chat icon in Obsidian's left ribbon → start talking.

---

## 🛠 Tech Stack

- **TypeScript** — both components
- **Obsidian Plugin API** — `ItemView`, `Plugin`, `MarkdownRenderer`
- **WebSocket** — real-time bidirectional communication (local-only, no network)
- **Cola Plugin SDK** (`@marswave/cola-plugin-sdk`) — channel registration & message delivery
- **esbuild** / **tsup** — fast bundling

---

## 📁 Project Structure

```
obsidian-cola/
├── obsidian-plugin/          # Obsidian community plugin
│   └── src/
│       ├── main.ts           # Plugin lifecycle, commands, settings
│       ├── ColaView.ts       # Chat sidebar UI (ItemView)
│       ├── ColaGateway.ts    # WebSocket client + reconnection logic
│       └── icons.ts          # SVG icon constants
├── cola-channel-plugin/      # Cola-side WebSocket server
│   └── src/
│       └── index.ts          # WS server, message routing, vault actions
└── docs/
    └── 技术方案.md            # Original technical design doc
```

---

## 🎯 Design Decisions

- **Local-only communication** — all data stays on your machine, zero cloud dependency for the bridge
- **Shared memory, isolated thread** — same Cola agent brain as the desktop app, but conversations don't interfere
- **Progressive enhancement** — complex tasks (image gen, deployment) gracefully redirect to Cola desktop
- **Token-based auth** — local token file prevents unauthorized WS connections

---

## 📝 Status

MVP complete — core chat, context awareness, vault actions, and paginated history all working.  
Submitted to both Obsidian Community Plugins and Cola Plugin Store for review.

---

## License

Apache-2.0

---

## Author

**Heran** · [GitHub](https://github.com/heran11011)
