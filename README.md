# cocosMcp — Cocos Creator 2.4 的 MCP 桥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cocos Creator](https://img.shields.io/badge/Cocos%20Creator-2.4-blue.svg)](https://docs.cocos.com/creator/2.4/manual/en/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![MCP](https://img.shields.io/badge/Protocol-MCP-purple.svg)](https://modelcontextprotocol.io/)
[![Status: MVP](https://img.shields.io/badge/Status-MVP-brightgreen.svg)](docs/plan.md)

让 AI 助手（Claude Desktop / Claude Code / Cursor / Windsurf 等）通过 [Model Context Protocol](https://modelcontextprotocol.io/) 直接操作 **Cocos Creator 2.4** 编辑器：读写场景节点、增删资源、看控制台日志、跑一段调试脚本……

参考了 [unity-mcp](https://github.com/CoplayDev/unity-mcp) 的 Python (FastMCP) + 编辑器插件 + WebSocket 的总体架构。

> 📋 **当前进度** 与 **后续路线图**：[`docs/plan.md`](docs/plan.md)
> 🏗️ **架构细节**：[`docs/architecture.md`](docs/architecture.md)
> ➕ **如何加一个新工具**：[`docs/adding-tools.md`](docs/adding-tools.md)
> 📊 **对标的 unity-mcp 完整功能集**：[`docs/unity-mcp-features.html`](docs/unity-mcp-features.html)（本地用浏览器打开）

## 架构

```
AI 助手 (Claude / Cursor / ...)
       ↓ MCP stdio
Python MCP Server   (server/)
       ↓ WebSocket  ws://127.0.0.1:6010/cocosmcp
Cocos Creator 2.4 编辑器扩展  (extension/)
       ↓ Editor API + scene-script
场景、资源、控制台
```

* **Python 端**：`server/` 是一个 FastMCP server。每个 tool 模块（`get_project_info`, `read_console`, `manage_asset`, `manage_scene`, `manage_node`, `execute_script`）只做参数校验和 envelope 包装，把命令转发给扩展。
* **编辑器端**：`extension/` 是一个标准 Cocos Creator 2.4 package。`main.js` 在主进程启动一个 `ws` server 并把每个 frame 派发到 `handlers/<command>.js`。需要访问 `cc.director` / 节点的操作通过 `Editor.Scene.callSceneScript('cocos-mcp', ...)` 转交 `scene-script.js`。

## 已实现的 MCP 工具（MVP）

| 工具                | 用途                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `get_project_info`  | 项目路径、编辑器版本、场景列表、可用命令——验活第一刀。             |
| `read_console`      | 读取 / 清空 `Editor.log/info/warn/error` 的环形缓冲。               |
| `manage_asset`      | `list / info / read / create / delete / refresh`（基于 `Editor.assetdb`）。 |
| `manage_scene`      | `list / current / open / save` 场景。                               |
| `manage_node`       | `tree / get / set_property / create / delete / add_component / selection`，需场景已打开。 |
| `execute_script`    | 在 main 进程或 scene 上下文里跑一段 JS。**强力但危险**，调用前请获得用户许可。 |

后续可加：`manage_prefab` / `manage_component`（按名字批量）/ `build` / `hot_update` / `manage_proto`（接你项目的 `BuildProto.cmd` 流程）等。

## 安装

### 1. 安装编辑器扩展

把 `extension/` 拷贝（或软链）到 Cocos Creator 项目的 `packages/cocos-mcp/`。`<YOUR_COCOS_PROJECT>` 换成你自己的 Cocos 项目路径：

```cmd
xcopy /E /I extension <YOUR_COCOS_PROJECT>\packages\cocos-mcp
```

进入 `extension/` 安装运行时依赖（只装一次）：

```cmd
cd /d <YOUR_COCOS_PROJECT>\packages\cocos-mcp
npm install
```

打开 Cocos Creator，重启编辑器一次让它发现新的 package。看到菜单【扩展】→【Cocos MCP】就装好了。默认会自动启动 Bridge，监听 `ws://127.0.0.1:6010/cocosmcp`。

### 2. 安装 Python server

需要 Python 3.10+。建议用 [uv](https://github.com/astral-sh/uv) 或 venv：

```cmd
cd server
python -m venv .venv
.venv\Scripts\activate
pip install -e .
```

或者用 uv：

```cmd
cd server
uv pip install -e .
```

跑一下 server 验证：

```cmd
python -m main --transport stdio
```

正常输出（写到 stderr）应该有 `cocos-mcp v0.1.0 starting` 和 `bridge target: ws://127.0.0.1:6010/cocosmcp`。Ctrl+C 退出。

### 3. 把 server 挂到 Claude Desktop / Claude Code

参考 [docs/claude-mcp-config-example.json](docs/claude-mcp-config-example.json)。Claude Desktop 配置文件大致：

```json
{
  "mcpServers": {
    "cocos": {
      "command": "<ABS_PATH_TO_REPO>/server/.venv/Scripts/python.exe",
      "args": ["-m", "main", "--transport", "stdio"],
      "cwd": "<ABS_PATH_TO_REPO>/server/src"
    }
  }
}
```

> Windows 上用正斜杠 `/` 或转义后的反斜杠 `\\`。macOS/Linux 把 `Scripts` 换成 `bin`，可执行文件去掉 `.exe`。

Claude Code（`~/.claude.json` 或 `claude mcp add` 命令）类似。

## 跑通第一遍

1. 在 Cocos Creator 里打开你的项目，看到底部多了个 “Cocos MCP” 面板（或在【扩展 → Cocos MCP】菜单里打开）。
2. 面板里能看到 “状态: 运行中”，URL `ws://127.0.0.1:6010/cocosmcp`。
3. 在 Claude 里问：“调用 `get_project_info` 看看项目路径。”——应该返回 `projectPath`、`editorVersion`、首批 scene 列表。
4. 接着问：“调用 `read_console` 拉最近 20 条日志。”

跑通这两个就说明端到端通了。

## 加一个新工具

1. 在 `extension/handlers/` 加 `your_thing.js`，导出 `{ name: 'your_thing', handle(params, ctx) { ... } }`。需要场景操作的就在 `scene-script.js` 里加一个 `mcp:*` op，并用 `Editor.Scene.callSceneScript` 转发。
2. 在 `server/src/services/tools/` 加 `your_thing.py`，用 `@cocos_mcp_tool` 装饰，函数体只做 `await call_bridge("your_thing", params)`。
3. 重启编辑器（让扩展重新 `load`），重启 Python server。新 tool 自动出现在 MCP 列表里。

参见 [docs/adding-tools.md](docs/adding-tools.md) 的更详细模板。

## 故障排查

* **Claude 调用工具返回 `bridge_unavailable`**：检查面板是不是显示 “状态: 已停止”；点【启动】或检查端口是否被占用。
* **`ws module not installed`**：去 `extension/` 跑 `npm install`。
* **`manage_node` 报 `no scene is currently open`**：先 `manage_scene action=open url=...`。
* **Python 端 import 报错**：确保你在 `server/src/` 目录跑 `python -m main`，或把 `src/` 加到 `PYTHONPATH`。

## 目录结构

```
cocosMcp/
├── server/                     Python MCP server (FastMCP)
│   ├── pyproject.toml
│   └── src/
│       ├── main.py             启动入口
│       ├── core/config.py      配置（host/port/timeout）
│       ├── transport/ws_client.py  WebSocket 客户端 + 请求响应映射
│       ├── services/
│       │   ├── registry.py     @cocos_mcp_tool 装饰器
│       │   └── tools/          每个 .py = 一个 MCP tool
│       └── utils/module_discovery.py
├── extension/                  Cocos Creator 2.4 编辑器扩展
│   ├── package.json
│   ├── main.js                 主进程入口；启动 WS server
│   ├── scene-script.js         scene 上下文的操作（cc.director 可用）
│   ├── handlers/               每个 .js = 一个 command
│   ├── lib/ws-server.js        ws 包装
│   ├── lib/console-hook.js     劫持 Editor.log 做环形缓冲
│   └── panel/index.js          编辑器内的状态面板
├── docs/
│   ├── architecture.md
│   ├── adding-tools.md
│   └── claude-mcp-config-example.json
├── install.cmd                 Windows 一键安装提示
├── CLAUDE.md                   给 AI 看的工作指引
└── README.md
```

## 贡献

这是一个还在快速迭代的 MVP，路线图在 [`docs/plan.md`](docs/plan.md) 里。欢迎提 Issue 讨论思路、提 PR 加工具——加工具的流程见 [`docs/adding-tools.md`](docs/adding-tools.md)。

代码风格的两条铁律（同 [`CLAUDE.md`](CLAUDE.md)）：

- **对称命名**：`tools/<name>.py` ↔ bridge command `<name>` ↔ `handlers/<name>.js`，三处同名。
- **资源操作不绕过 assetdb**：所有写资源的操作走 `Editor.assetdb.create/delete/refresh/setMetaInfo`，**禁止** `fs.writeFileSync` 直接写工程资源。

## 许可证

[MIT](LICENSE)。参考了 [unity-mcp](https://github.com/CoplayDev/unity-mcp)（同样 MIT）的设计思路。
