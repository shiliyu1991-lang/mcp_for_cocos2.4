# CLAUDE.md — cocosMcp

Guidance for AI agents (Claude Code / Cursor / Windsurf) working in this repo.

## What this project is

cocosMcp is an MCP server + Cocos Creator 2.4 editor extension that lets an AI assistant drive the editor: read scenes, mutate nodes, manage assets, watch the console, run debug snippets.

Architecturally a near-copy of [unity-mcp](https://github.com/CoplayDev/unity-mcp): Python (FastMCP) server, editor-side plugin, JSON-over-WebSocket between them. Two codebases, one system.

## Layout

```
server/          Python FastMCP server (each tool = one .py file)
extension/       Cocos Creator 2.4 package
extension/handlers/      one .js per command, called from main process
extension/scene-script.js  cc.director / scene-graph operations
extension/lib/ws-server.js wraps `ws`
extension/lib/console-hook.js  ring-buffer for Editor.log/warn/error
docs/            architecture, "adding a tool" walkthrough, MCP config example
```

## Adding a tool

Mirror image: every tool exists on both sides.

1. **Extension handler** — `extension/handlers/<name>.js`:
   ```js
   async function handle(params, ctx) {
       // ctx.consoleBuffer is the ring buffer if you need it
       // throw on error; the ws-server turns it into a structured reply
       return { ... };  // JSON-serializable
   }
   module.exports = { name: '<name>', handle };
   ```
   If you need `cc.director` / live nodes, add a `mcp:<name>` op in `scene-script.js` and forward through `Editor.Scene.callSceneScript('cocos-mcp', op, payload, cb)`.

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

- Don't access `cc` / `cc.director` / `cc.Node` from `main.js` or `handlers/*.js` — those run in the extension's main process and have no engine. Forward to `scene-script.js`.
- Don't write to assets directly with `Fs`. Use `Editor.assetdb.create/delete/refresh` so the asset DB stays consistent.
- Don't add npm dependencies to the extension casually — Cocos's package isolation is shaky and a heavy install can confuse users. `ws` is the only runtime dep right now.
- Don't expose `execute_script` defaults that auto-confirm. The Python wrapper trusts the LLM to ask the user before destructive runs.

## Testing locally without Cocos Creator

The Python server can be syntax-checked with `python -m py_compile src/**/*.py`. The extension JS with `node --check`. Real end-to-end testing needs the editor open and the bridge running.

## Open ideas (post-MVP)

- `manage_prefab` — instantiate / apply / revert prefabs.
- `manage_component` — typed component CRUD without the dotted-string path.
- `build` — wrap your `auto-build-*.cmd` flows.
- `proto_regen` — call `BuildProto.cmd` and surface the diff.
- A `notification` channel (server → client) for live console streaming.
