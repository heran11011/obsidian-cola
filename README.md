# Obsidian-Cola

在 Obsidian 侧边栏直接与 Cola 对话，自动感知当前文件上下文。

## 项目结构

```
obsidian-cola/
├── docs/                    # 技术方案、设计文档
│   └── 技术方案.md
├── obsidian-plugin/         # Obsidian 社区插件（侧边栏 UI + 文件感知）
└── cola-channel-plugin/     # Cola Channel Plugin（本地 WS Server）
```

## 定位

- **写作场景的轻量入口**：感知你在写什么，帮你想、帮你查、帮你改
- **共享记忆，独立线程**：和 Cola 桌面端是同一个 Cola，但对话互不干扰
- 复杂任务（生图、部署、浏览器操作）引导用户回 Cola 桌面端

## 架构

```
Obsidian 插件 ──ws://127.0.0.1:19533──→ Cola Channel Plugin ──ctx.deliver()──→ Cola Agent
                                                              ←── outbound.sendText() ──┘
```

## 状态

🚧 开发中 — MVP 阶段

## 作者

Heran
