# cocosMcp 使用文档

让 AI 助手（Claude Desktop / Claude Code / Cursor 等）通过 MCP 协议驱动你的 Cocos Creator 编辑器：读场景、改节点、查资源、看控制台。

支持两个版本，**同一份 Python server**：

- **Cocos Creator 2.4** → 用 `cocos-mcp-2x/` 插件
- **Cocos Creator 3.8.x** → 用 `cocos-mcp-3x/` 插件

> 仓库里的 `extension/` 和 `extension-3x/` 是早期版本，已被替代，可以无视。

---

## 总览

```
┌───────────────────┐  MCP stdio/http  ┌────────────────────────┐
│ Claude Desktop /   │◀────────────────▶│  Python MCP server      │
│ Claude Code /      │                  │  (server/)              │
│ Cursor             │                  │  内嵌 WS server@6010    │
└───────────────────┘                  └────────────▲────────────┘
                                                    │ ws://127.0.0.1:6010/cocosmcp
                                                    │ (extension 作为 client 拨号)
                                       ┌────────────┴────────────┐
                                       │ Cocos Creator           │
                                       │ ├ 2.4 → cocos-mcp-2x/    │
                                       │ └ 3.8.x → cocos-mcp-3x/  │
                                       └─────────────────────────┘
```

Python server 启动后会监听 `ws://127.0.0.1:6010/cocosmcp` 等扩展拨号上来。用户在 Cocos 面板点【连接】，整个链路就通了。

---

## 一、安装 Python server（一次性，两个版本共用）

需要 Python 3.10+。

```bat
cd D:\AIToolEdit\cocosMcp\server
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -e .
```

装完后这个路径会有 Python 可执行：

```
D:\AIToolEdit\cocosMcp\server\.venv\Scripts\python.exe
```

后面给 Claude Desktop / Cursor 配 MCP 服务时用得到。

---

## 二、装 Cocos 插件

> ⚠️ **先确保 6010 端口空闲**：如果你以前装过老的 `extension/`（2.4 版本会自己监听 6010），先去 `<2.4 项目>\packages\cocos-mcp\` 把那个旧目录删掉，并重启 2.4 编辑器。否则 Python server 起不来（`OSError: bind on address 127.0.0.1:6010`）。
>
> 用 `netstat -ano | findstr :6010` 能查到谁占了 6010。

### A. Cocos Creator 2.4

把整个 `cocos-mcp-2x/` 文件夹复制到你的 2.4 项目下：

```
<你的2.4项目>\
  packages\
    cocos-mcp-2x\          ← 整个文件夹粘贴到这里
      package.json
      main.js
      scene-script.js
      panel\
        index.js
```

> 2.4 的扩展放在 `packages/`，不是 3.x 的 `extensions/`。

启动 2.4 Cocos Creator，菜单顶端会多出 **扩展 → Cocos MCP → 打开面板**。

### B. Cocos Creator 3.8.x

把整个 `cocos-mcp-3x/` 文件夹复制到你的 3.x 项目下：

```
<你的3.x项目>\
  extensions\
    cocos-mcp-3x\          ← 整个文件夹粘贴到这里
      package.json
      main.js
      panel\
        index.js
```

启动 3.8.x Cocos Creator，菜单 **Extension → Cocos MCP → Open Panel**。

> 两个插件都 **不依赖 npm 包**。WebSocket client 是手写嵌进 main.js 的，Node 自带的 `net` + `crypto` 就够了。

---

## 三、跑起来（4 步）

### 1. 启 Python server

新建一个 `.cmd` 方便每次启动，比如 `D:\AIToolEdit\cocosMcp\start-server.cmd`：

```bat
@echo off
cd /d D:\AIToolEdit\cocosMcp\server\src
D:\AIToolEdit\cocosMcp\server\.venv\Scripts\python.exe -m main --transport http --http-port 8765
pause
```

双击运行。看到：

```
cocos bridge listening on ws://127.0.0.1:6010/cocosmcp
```

就成功了。窗口保持开着别关。

> `--transport http` 是给手动测试用的；下面第 4 步给 Claude Desktop / Cursor 配 MCP 时换成 `--transport stdio`，由它们自己 spawn 进程，不需要这个 .cmd。

### 2. 开 Cocos Creator + 打开面板

- 2.4：菜单 **扩展 → Cocos MCP → 打开面板**
- 3.x：菜单 **Extension → Cocos MCP → Open Panel**

### 3. 在面板上点【连接】

URL 默认就是 `ws://127.0.0.1:6010/cocosmcp`。点【连接】。

状态变绿 **已连接**，Python 终端那边会打印 `cocos extension connected`。

### 4. 配到 Claude Desktop / Cursor / Claude Code

把第 1 步的 .cmd 关掉，改用 stdio 让 MCP 客户端自己 spawn。

**Claude Desktop**：找到 `claude_desktop_config.json`（菜单 Settings → Developer → Edit Config），加：

```json
{
  "mcpServers": {
    "cocos": {
      "command": "D:/AIToolEdit/cocosMcp/server/.venv/Scripts/python.exe",
      "args": ["-m", "main", "--transport", "stdio"],
      "cwd": "D:/AIToolEdit/cocosMcp/server/src"
    }
  }
}
```

**Cursor**：`.cursor/mcp.json` 同上结构。

**Claude Code**：在项目目录跑

```
claude mcp add cocos -- D:/AIToolEdit/cocosMcp/server/.venv/Scripts/python.exe -m main --transport stdio
```

并把 `cwd` 设到 `D:/AIToolEdit/cocosMcp/server/src`。

> 用 stdio 时，Python 进程由 MCP 客户端自己启停，不需要你手动开窗口。配好之后，依旧是：开 Cocos → 打开面板 → 点【连接】。Python 那边 `cocos extension connected` 是从 MCP 客户端 spawn 的进程的 stderr 出，看不到也没关系，只要面板显示绿就行。

---

## 四、当前支持的 MCP 工具

| 工具 | 2.4 | 3.x | 说明 |
|---|:-:|:-:|---|
| `get_project_info` | ✅ | ✅ | 项目路径、editor 版本、scene 列表 |
| `read_console` | ✅ | ✅ | 拉最近的 editor 控制台输出，可过滤 level/关键字 |
| `manage_scene` `list/current/open/save` | ✅ | ✅ | 列/查当前/打开/保存场景 |
| `manage_node` | ⏳ | ⏳ | 节点树读写（计划中） |
| `manage_asset` | ⏳ | ⏳ | 资源 CRUD（计划中） |
| `execute_script` | ⏳ | ⏳ | 任意 JS 逃生口（计划中） |

加新工具时往对应 `main.js` 的 `handlers = { ... }` 对象里加一个键就行，server 侧 `services/tools/*.py` 已经写好转发。

---

## 五、常见错误

### Python 启动报 `OSError: [Errno 10048] bind on address ('127.0.0.1', 6010)`

6010 被别的进程占了。最可能的元凶：

- 老的 `extension/`（2.4 版本）还装在某个 Cocos 项目里、Cocos 编辑器开着。它会自己监听 6010。**把那个老插件目录删了**，或者关掉那个 Cocos 实例。
- 上一次 Python server 没退干净。`netstat -ano | findstr :6010` 找 PID，`taskkill /PID <pid> /F` 杀掉。

迫不得已要换端口：Python 启动加 `--bridge-port 6011`，**面板 URL 同步改成 `ws://127.0.0.1:6011/cocosmcp`** 再点连接。

### 面板点连接报 `ECONNREFUSED 127.0.0.1:6010`

Python server 没起，或者起在别的端口。看 Python 终端那行 `cocos bridge listening on …` 的端口，跟面板 URL 对上。

### 面板点连接报 `handshake failed: HTTP/1.1 404 Not Found`

URL 末尾的 `/cocosmcp` 路径写错了。完整 URL 必须是 `ws://127.0.0.1:6010/cocosmcp`。

### 状态显示已连接，但 Claude 调 tool 总返回 `bridge_unavailable`

面板上的连接是 Python ↔ Cocos 这一段。Claude ↔ Python 那一段是 MCP 协议，跟面板无关。检查：

- Claude Desktop / Cursor 的 mcpServers 配置里的 `command` / `cwd` 路径对不对
- 重启 Claude Desktop / Cursor（它们只在启动时 spawn MCP 进程）
- 用 `--transport http` 临时手动跑 Python，看启动日志有没有报错

### 改了 panel/index.js 但面板没更新

- 2.4：菜单 **开发者 → 重载编辑器**（或重启 Cocos）
- 3.x：菜单 **开发者 → 重载扩展**（或重启 Cocos）

---

## 六、目录结构

```
cocosMcp/
├── cocos-mcp-2x/              ← 复制这个进 2.4 项目的 packages/
│   ├── package.json
│   ├── main.js
│   ├── scene-script.js
│   └── panel/index.js
├── cocos-mcp-3x/              ← 复制这个进 3.x 项目的 extensions/
│   ├── package.json
│   ├── main.js
│   └── panel/index.js
├── server/                    ← Python MCP server，2.4 和 3.x 共用
│   ├── pyproject.toml
│   └── src/
│       ├── main.py
│       ├── core/config.py
│       ├── transport/ws_client.py
│       └── services/tools/   ← 每个 .py 一个 MCP 工具
├── docs/                      ← 架构 / 计划 / 历史文档
├── USAGE.md                   ← 你正在看的文件
├── CLAUDE.md                  ← AI 助手在仓库里干活时的指引
└── extension/, extension-3x/  ← 旧版本，已废弃，别动
```

---

## 七、要加新工具？

参考 [CLAUDE.md](./CLAUDE.md) 里的「Adding a tool」一节。简单说就是：

1. 在 `server/src/services/tools/<name>.py` 加一个用 `@cocos_mcp_tool` 装饰的函数，函数体一般就一行 `await call_bridge("<name>", {...})`。
2. 在 `cocos-mcp-2x/main.js` 和 `cocos-mcp-3x/main.js` 的 `handlers = { ... }` 对象里各加一个同名键，函数体里用对应版本的 Cocos 编辑器 API 干活。
3. 重启 Python server、重载 Cocos 扩展。

工具名 = bridge command 名 = 函数键名，三处保持一致。
