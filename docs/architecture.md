# 架构

## 总览

```
┌──────────────────┐    MCP stdio / HTTP     ┌──────────────────────────┐
│  AI 助手 / Claude │◀───────────────────────▶│  Python MCP server       │
│  / Cursor / 等   │                          │  (FastMCP, server/)      │
└──────────────────┘                          └────────────┬─────────────┘
                                                            │ JSON over WebSocket
                                                            │ ws://127.0.0.1:6010/cocosmcp
                                                            ▼
                                              ┌──────────────────────────┐
                                              │ Cocos Creator 2.4 编辑器 │
                                              │ extension/ (cocos-mcp)   │
                                              │  ├ main.js (主进程)      │
                                              │  ├ scene-script.js       │
                                              │  └ handlers/*.js         │
                                              └──────────────────────────┘
```

两边的数据流是对称的：每个工具在 Python 侧有 `services/tools/<name>.py`，在扩展侧有 `handlers/<name>.js`。Python 文件做参数声明 + 转发；JS 文件做实际工作。

## 协议

WebSocket，一条 JSON / 一条消息（无 framing）。

### 请求（server → extension）

```json
{
  "id": "uuid-v4-string",
  "command": "manage_node",
  "params": { "action": "tree", "uuid": "abc..." }
}
```

* `id` 由 server 生成，extension 原样回传——server 用它把 reply 路由回正确的 `Future`。
* `command` 必须等于某个 `extension/handlers/*.js` 文件的 `name`（默认就是文件名去掉 `.js`）。
* `params` 是一个 dict，handler 自定义 schema。

### 响应（extension → server）

成功：

```json
{ "id": "...", "success": true, "data": <whatever> }
```

失败：

```json
{ "id": "...", "success": false, "error": "human message", "stack": "..." }
```

`stack` 只在 debug 时有意义，server 默认不展示给 LLM。

### 招呼帧

新连接时 extension 会主动发：

```json
{ "type": "hello", "server": "cocos-mcp", "version": 1 }
```

server 把没 `id` 的帧默认丢弃。

## scene-script 转发

`handlers/manage_node.js` 这种需要访问 `cc.director` 的 handler，自己不做事，只是用 `Editor.Scene.callSceneScript('cocos-mcp', 'mcp:node-tree', payload, cb)` 把请求扔给 `scene-script.js`。`scene-script.js` 在 Cocos Creator 的 scene 上下文（renderer 进程）里跑，能拿到当前打开的 scene。

为什么要分两层？因为 `Editor.assetdb` 这类只在 main 进程可用，`cc.director.getScene()` 又只在 scene 上下文可用。`extension/handlers/` 是 main 进程的入口，`scene-script.js` 是 scene 上下文的 op 集合。

## Python server 内部

* `transport/ws_client.py` —— 单连接、自动重连、用一张 `pending` 表把 reply 配对到 Future。
* `services/registry.py` —— `@cocos_mcp_tool` 装饰器把函数塞到全局 list。
* `services/tools/` —— auto-discovery（启动时遍历这目录下所有 `.py` 文件，调一次 `import`）。

启动顺序（`main.py`）：

1. 解析 CLI 参数，更新 `core.config.config`。
2. 构造一个 `CocosBridge` 单例，挂到 `set_global_bridge`。
3. 构造 FastMCP 实例，调 `register_all_tools(mcp)`。
4. `mcp.run(transport="stdio")`。

## Extension 启动顺序

1. Cocos Creator 加载 package，调 `main.js#load()`。
2. `main.js` 读 `config.json`（host/port/autoStart），如果 `autoStart` 就启 bridge。
3. `lib/console-hook.js#install()` 替换 `Editor.log/info/warn/error` 为带环形缓冲的版本。
4. `lib/ws-server.js` 起 `ws.Server` 监听。
5. 收到帧 → `handlers/index.js#dispatch` 找 handler → `await handle(params, ctx)` → `reply({success/data/error})`。

## 失败模式

* server 启动时 extension 没开 → 第一次 tool 调用会拿到 `BridgeUnavailable`，包装成 `success: false, errorType: 'bridge_unavailable'` 给 LLM。
* extension crash / Cocos 关掉 → reader loop 退出，所有 in-flight 的 Future 收到 `BridgeUnavailable`，下一次调用尝试重连。
* port 被占（默认 6010）→ extension 起不来；面板会显示 “已停止”，用户改个端口再 restart。
