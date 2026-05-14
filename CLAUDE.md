# CLAUDE.md — cocosMcp

Guidance for AI agents (Claude Code / Cursor / Windsurf) working in this repo.

## What this project is

cocosMcp is an MCP server + Cocos Creator editor extension that lets an AI assistant drive the editor: read scenes, mutate nodes, manage assets, watch the console, run debug snippets.

There are **two minimal plugin folders** sharing one Python server:

- `cocos-mcp-2x/` — Cocos Creator **2.4** target. 4 files (`package.json`, `main.js`, `scene-script.js`, `panel/index.js`). Uses `Editor.assetdb` callbacks, `Editor.Scene.callSceneScript`, global `cc`, `.fire` scenes.
- `cocos-mcp-3x/` — Cocos Creator **3.8.x** target. 3 files (`package.json`, `main.js`, `panel/index.js`). Uses `Editor.Message.request`, built-in `scene` module endpoints, ES-module-friendly `cc`, `.scene` scenes.

Both plugins:
- Are **WebSocket clients** that dial into Python's WS server (listening on `127.0.0.1:6010/cocosmcp`).
- Have **no npm dependencies** — WebSocket client is hand-rolled on Node's built-in `net` + `crypto`.
- Are **paste-and-go** — drop the folder into the Cocos project's `packages/` (2.4) or `extensions/` (3.x), restart Cocos, click **Connect** in the panel.

The JSON frame format on the wire is identical for both — only the editor-side JS differs. The server's `transport/`, `registry`, and `services/tools/*.py` work for either.

Architecturally a near-copy of [unity-mcp](https://github.com/CoplayDev/unity-mcp): Python (FastMCP) server, editor-side plugin, JSON-over-WebSocket between them.

User-facing usage doc: [USAGE.md](./USAGE.md).

## Layout

```
server/                 Python FastMCP server (each tool = one .py file)
  src/transport/ws_client.py   despite the name this is the WS *server* that
                               the Cocos extension dials into (port 6010
                               by default). Runs on a daemon thread with its
                               own asyncio loop; bridge.call() dispatches
                               onto it via run_coroutine_threadsafe.

cocos-mcp-2x/           Cocos Creator 2.4 plugin
  package.json          name: cocos-mcp-2x, declares panel + scene-script + main-menu
  main.js               WS client + Editor.log hook + command handlers
  scene-script.js       cc.director access for manage_scene `current`
  panel/index.js        Vue 1 + Editor.Panel.extend UI

cocos-mcp-3x/           Cocos Creator 3.8.x plugin
  package.json          package_version: 2, contributions + panel registration
  main.js               WS client + console.* hook + command handlers
  panel/index.js        3.x panel API UI

docs/                   architecture, plan, MCP config example
USAGE.md                user-facing install & run instructions

extension/, extension-3x/    legacy, see DEPRECATED.md in each folder
```

## Adding a tool

Mirror image: every tool exists on **both** the server side and the editor side. When porting/adding for both engines, write the JS body twice (in `cocos-mcp-2x/main.js` and `cocos-mcp-3x/main.js`) — the Python side is shared.

1. **Editor handler — both versions live in the `handlers = { … }` object inside `main.js`:**

   **2.4** (`cocos-mcp-2x/main.js`): use callback-style `Editor.assetdb.*` and forward to `scene-script.js` when you need `cc.director`:
   ```js
   async my_tool(params) {
       // Async work via wrapped callbacks:
       const r = await new Promise((res, rej) =>
           Editor.assetdb.queryAssets(pattern, type, (e, x) => e ? rej(e) : res(x)));
       // OR forward to scene-script:
       const s = await _callSceneScript('mcp:my-op', params);
       return { ... };
   }
   ```
   If `mcp:my-op` is a new scene op, add a handler in `cocos-mcp-2x/scene-script.js`.

   **3.8.x** (`cocos-mcp-3x/main.js`): use Promise-based `Editor.Message.request`:
   ```js
   async my_tool(params) {
       const r = await Editor.Message.request('asset-db', 'query-assets', { ... });
       return { ... };
   }
   ```
   3.x's built-in `scene` module endpoints (`query-node`, `query-node-tree`, `set-property`, `create-node`, `create-component`, `open-scene`, `save-scene`) cover most cases without a custom scene-script. If you do need one, add `extension-3x/scene-script.js` and point `package.json#contributions.scene.script` at it.

2. **Python tool** — `server/src/services/tools/<name>.py`:
   ```python
   from services.registry import cocos_mcp_tool
   from services.tools._common import call_bridge

   @cocos_mcp_tool(description="...")
   async def my_tool(ctx, foo: str | None = None) -> dict:
       return await call_bridge("<name>", {"foo": foo})
   ```

   The .py file must live directly in `services/tools/`; auto-discovery imports it on startup.

3. Restart Cocos Creator (so the extension reloads) and restart the Python server (so it re-discovers tools).

## Code philosophy (carried over from unity-mcp)

- **Symmetry.** Python tool name == bridge command name == handler filename.
- **Minimal abstraction.** Every tool's Python body is currently 1–10 lines. Don't introduce a base class until there are 5+ tools that genuinely share logic.
- **One thing per tool.** Resist parameter creep. If a tool grows beyond ~6 actions, split it.
- **Errors flow through.** Always `await call_bridge(...)` and return its envelope as-is. Don't swallow `success: False`.

## What to NOT do

- Don't access `cc` / `cc.director` / `cc.Node` from `main.js` — it runs in the extension's main process and has no engine. Forward to `scene-script.js` (2.4) or one of 3.x's built-in scene-module endpoints.
- Don't write to assets directly with `Fs`. Use the asset DB so it stays consistent — `Editor.assetdb.create/delete/refresh` on 2.4, or `Editor.Message.request('asset-db', '<op>-asset', ...)` on 3.x.
- **Don't add npm dependencies to the editor plugins.** Both `cocos-mcp-2x/` and `cocos-mcp-3x/` are zero-npm — the WebSocket client is inlined in `main.js` on top of Node's `net` + `crypto`. Keeping it that way means the plugins stay paste-and-go. If you really need a third-party module, vendor a single file rather than introducing `node_modules/`.
- Don't expose `execute_script` defaults that auto-confirm. The Python wrapper trusts the LLM to ask the user before destructive runs.
- Don't let 2.4 and 3.x code drift in behavior silently. When you change a handler in one, port the change to the other in the same PR, or open a follow-up explicitly noting the gap.
- Don't touch `extension/` or `extension-3x/` — those are legacy. New work goes into `cocos-mcp-2x/` and `cocos-mcp-3x/`.

## Testing locally without Cocos Creator

The Python server can be syntax-checked with `python -m py_compile src/**/*.py`. The extension JS with `node --check`. Real end-to-end testing needs the editor open and the bridge running.

## Open ideas (post-MVP)

- `manage_prefab` — instantiate / apply / revert prefabs.
- `manage_component` — typed component CRUD without the dotted-string path.
- `build` — wrap your `auto-build-*.cmd` flows.
- `proto_regen` — call `BuildProto.cmd` and surface the diff.
- A `notification` channel (server → client) for live console streaming.
