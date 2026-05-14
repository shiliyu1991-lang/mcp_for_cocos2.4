# 架构

## 总览

```
┌──────────────────┐    MCP stdio / HTTP     ┌──────────────────────────┐
│  AI 助手 / Claude │◀───────────────────────▶│  Python MCP server       │
│  / Cursor / 等   │                          │  (FastMCP, server/)      │
└──────────────────┘                          │  内嵌 WS server@6010      │
                                              └────────────▲─────────────┘
                                                           │ JSON over WebSocket
                                                           │ ws://127.0.0.1:6010/cocosmcp
                                                           │
                                              ┌────────────┴─────────────┐
                                              │ Cocos Creator (2.4 或 3.x) │
                                              │ extension/    (2.4，自身  │
                                              │   是 WS server，Python   │
                                              │   反向连入)               │
                                              │ extension-3x/ (3.8.x，是  │
                                              │   WS client，面板点连接)  │
                                              └──────────────────────────┘
```

数据流方向（v0.2）：
- **3.x**：Python 启动后内嵌的 WS server 监听 6010；用户在 Cocos 面板点【连接】，扩展作为 client 拨号上来；之后 server → extension 发命令，extension → server 回结果。
- **2.4（v0.1 状态保留在仓库，但当前 Python server 不再兼容）**：v0.1 的 2.4 扩展自己是 WS server，Python 旧版以 client 模式 dial-in。改造完 transport/ 后这条路径暂时断了 —— `extension/` 仍可作为 2.4 端的参考实现，但要重新跑通需要恢复 Python 的 client 模式（或把 2.4 扩展也按 3.x 那样改成 client）。目前重心在 3.x。

两边的数据流是对称的：每个工具在 Python 侧有 `services/tools/<name>.py`（参数声明 + `await call_bridge(...)`），在扩展侧由 JS 实际执行 —— 2.4 用 `handlers/<name>.js`，3.x 直接是 `extension-3x/main.js` 里 `handlers = { ... }` 对象的一个键。

**关于双扩展**：两套代码各自独立维护，避免在 JS 里写引擎版本分支。运行时只装其中一个——2.4 用户装到 `<project>/packages/cocos-mcp/`，3.x 用户装到 `<project>/extensions/cocos-mcp/`。详见 [`extension-3x/README.md`](../extension-3x/README.md)。

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

`handlers/manage_node.js` 这种需要访问 `cc.director` 的 handler，自己不做事，只是把请求扔给 `scene-script.js`。`scene-script.js` 在 Cocos Creator 的 scene 上下文（renderer 进程）里跑，能拿到当前打开的 scene。

转发方式两个版本不一样：

- **2.4**：`Editor.Scene.callSceneScript('cocos-mcp', 'mcp:node-tree', payload, cb)`，scene-script 在 `module.exports` 里挂 `'mcp:node-tree': function (event, payload) { ... event.reply(err, data) }`。
- **3.x**：`await Editor.Message.request('scene', 'execute-scene-script', { name: 'cocos-mcp', method: 'nodeTree', args: [payload] })`，scene-script 在 `module.exports.methods.nodeTree(payload)` 里 return / throw。

为什么要分两层？因为 asset DB 那一类 API 只在 main 进程可用，`cc.director.getScene()` 又只在 scene 上下文可用。`handlers/` 是 main 进程的入口，`scene-script.js` 是 scene 上下文的 op 集合。

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
