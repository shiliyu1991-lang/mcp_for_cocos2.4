# mcpforcocos

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cocos Creator](https://img.shields.io/badge/Cocos%20Creator-2.4%20%2F%203.8.x-blue.svg)](https://www.cocos.com/creator)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![MCP](https://img.shields.io/badge/Protocol-MCP-purple.svg)](https://modelcontextprotocol.io/)

让 AI 助手（Claude Desktop / Claude Code / Cursor / Windsurf 等）通过 [Model Context Protocol](https://modelcontextprotocol.io/) 直接驱动 **Cocos Creator** 编辑器：读场景、改节点、查资源、看控制台。

支持两个引擎版本，**同一份 Python server**：

| 引擎 | 插件文件夹 | 安装位置 |
|---|---|---|
| Cocos Creator 2.4 | [`cocos-mcp-2x/`](./cocos-mcp-2x/) | `<项目>/packages/cocos-mcp-2x/` |
| Cocos Creator 3.8.x | [`cocos-mcp-3x/`](./cocos-mcp-3x/) | `<项目>/extensions/cocos-mcp-3x/` |

两个插件都**粘贴即用、零 npm 依赖**。WebSocket 客户端是手写嵌进 `main.js` 的，只用 Node 自带的 `net` + `crypto`。

## 快速开始

详见 **[USAGE.md](./USAGE.md)** —— 装 Python server、装插件、连面板、配 Claude Desktop / Cursor 全套步骤都在那里。

最简一句话：

1. `python -m main --transport http --http-port 8765` 起 Python server（默认监听 `ws://127.0.0.1:6010/cocosmcp`）
2. 把对应版本的 `cocos-mcp-{2x,3x}/` 整个文件夹复制到 Cocos 项目的 `packages/` 或 `extensions/`
3. 启动 Cocos，打开面板，点【连接】，状态变绿就行

## 架构

```
┌──────────────┐  MCP  ┌──────────────────┐  WS@6010  ┌────────────────┐
│ Claude /      │◀────▶│ Python MCP server │◀─────────│ Cocos 编辑器    │
│ Cursor / 等   │       │ (server/)         │  client  │ (插件作 client)  │
└──────────────┘       └──────────────────┘   dial-in └────────────────┘
```

详见 [docs/architecture.md](./docs/architecture.md)。

## 当前支持的工具

| 工具 | 2.4 | 3.x |
|---|:-:|:-:|
| `get_project_info` | ✅ | ✅ |
| `read_console` | ✅ | ✅ |
| `manage_scene` (`list/current/open/save`) | ✅ | ✅ |
| `manage_node` | ⏳ | ⏳ |
| `manage_asset` | ⏳ | ⏳ |
| `execute_script` | ⏳ | ⏳ |

加新工具的流程：[CLAUDE.md](./CLAUDE.md) 的 "Adding a tool" 一节。

## 仓库结构

```
mcpforcocos/
├── cocos-mcp-2x/        ← Cocos Creator 2.4 插件，整体粘贴
├── cocos-mcp-3x/        ← Cocos Creator 3.8.x 插件，整体粘贴
├── server/              ← Python MCP server，2.4 / 3.x 共用
├── docs/                ← 架构、MCP 配置示例
├── USAGE.md             ← 用户使用文档（先读这个）
├── CLAUDE.md            ← AI 助手在仓库里干活时的指引
└── README.md            ← 你正在看的文件
```

## License

[MIT](LICENSE)
