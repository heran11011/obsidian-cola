# Obsidian Channel Plugin for Cola

Connect Cola to Obsidian through a local WebSocket bridge. This plugin runs inside Cola and provides the server-side endpoint that the Obsidian plugin connects to.

## Features

- Local WebSocket server for Obsidian plugin communication
- Zero-config authentication via local token file
- Receives messages with file context (current file path + content)
- Sends Cola replies back to the Obsidian sidebar

## How It Works

```
Obsidian Plugin ──ws://127.0.0.1:19533──→ This Plugin ──ctx.deliver()──→ Cola Agent
                                                       ←── outbound.sendText() ──┘
```

## Setup

1. Install this plugin from the Cola plugin store.
2. The plugin automatically starts a local WebSocket server on port 19533.
3. A token file is generated at `~/.cola/plugins/obsidian/local-token`.
4. The Obsidian plugin reads this token and connects automatically.

## Configuration

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `port` | No | `19533` | Local WebSocket server port |

## Commands

- `/obsidian status` — Show connection status

## Protocol

### Client → Server (Obsidian → Cola)

```json
{
  "type": "message",
  "text": "用户输入的文本",
  "context": {
    "filePath": "notes/daily/2026-06-06.md",
    "fileName": "2026-06-06",
    "content": "文件内容（最多 10K 字符）"
  }
}
```

### Server → Client (Cola → Obsidian)

```json
{
  "type": "reply",
  "text": "Cola 的回复"
}
```

### Connection Welcome

```json
{
  "type": "connected",
  "message": "Connected to Cola",
  "connId": "abc123..."
}
```

## Development

```bash
npm install
npm run build
```

## Security

- Server only listens on `127.0.0.1` (localhost only)
- Token file permissions are `600` (owner read/write only)
- No network exposure
