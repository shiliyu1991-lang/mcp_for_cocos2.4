# cocos-mcp server

Python (FastMCP) MCP server. See top-level [README](../README.md) for the full picture; this file is just for the server piece.

## Layout

```
src/
├── main.py                       Entry point. `python -m main`
├── core/config.py                Mutable Config (host, port, timeouts)
├── transport/ws_client.py        WebSocket client to the editor extension
├── services/
│   ├── registry.py               @cocos_mcp_tool decorator
│   └── tools/
│       ├── __init__.py           register_all_tools (auto-discovery)
│       ├── _common.py            call_bridge() envelope wrapper
│       ├── get_project_info.py
│       ├── read_console.py
│       ├── manage_asset.py
│       ├── manage_scene.py
│       ├── manage_node.py
│       └── execute_script.py
└── utils/module_discovery.py
```

## Run

```bash
cd src
python -m main --transport stdio
# or
python -m main --transport http --http-port 8765
```

Env vars (override CLI / defaults):

| var                          | default            |
| ---------------------------- | ------------------ |
| `COCOS_MCP_BRIDGE_HOST`      | `127.0.0.1`        |
| `COCOS_MCP_BRIDGE_PORT`      | `6010`             |
| `COCOS_MCP_BRIDGE_PATH`      | `/cocosmcp`        |
| `COCOS_MCP_REQUEST_TIMEOUT`  | `30` (seconds)     |
| `COCOS_MCP_CONNECT_TIMEOUT`  | `5` (seconds)      |

## Developing

Sanity check syntax without running:

```bash
python -m py_compile src/main.py src/transport/ws_client.py \
    src/services/registry.py src/services/tools/*.py
```

Add a new tool: see [../docs/adding-tools.md](../docs/adding-tools.md).
