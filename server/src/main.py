"""
cocos-mcp server entrypoint.

Boots a FastMCP server that exposes a small set of tools backed by a
WebSocket bridge running inside the Cocos Creator 2.4 editor (the
`extension/` package in this repo).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from typing import Any

# Make `typing` names visible to runtime annotation evaluation in case the
# environment evaluates string annotations against an empty globals dict.
try:
    import builtins
    import typing as _typing

    for _name in ("Annotated", "Literal", "Any", "Optional", "Union"):
        if not hasattr(builtins, _name) and hasattr(_typing, _name):
            setattr(builtins, _name, getattr(_typing, _name))
except Exception:
    pass

# Windows: prefer SelectorEventLoop for websockets compatibility.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastmcp import FastMCP  # noqa: E402  (after sys.path/asyncio tweaks)

from core.config import config  # noqa: E402
from transport.ws_client import CocosBridge, set_global_bridge  # noqa: E402
from services.tools import register_all_tools  # noqa: E402


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("cocos-mcp")


INSTRUCTIONS = """
This server controls a Cocos Creator 2.4 editor instance through a small
WebSocket bridge that runs as an editor extension.

What you can do:
- get_project_info       — sanity-check the bridge & inspect project metadata
- read_console           — pull recent Editor.log/warn/error entries
- manage_asset           — list/info/read/create/delete/refresh assets
- manage_scene           — list/open/save/current scene (.fire)
- manage_node            — query/create/edit/delete nodes in the open scene
- execute_script         — run a JS snippet (powerful escape hatch — ASK USER)

Conventions:
- Asset urls follow Cocos's `db://assets/...` scheme. `manage_asset.read`
  is limited to small text-ish files (<1MB).
- Scene-graph mutations only work when a scene is open in the editor.
- `execute_script` runs arbitrary JS; treat it as requiring explicit user
  permission. Prefer the typed tools whenever they cover the use case.

Debugging:
- If a tool returns "bridge unavailable", the user needs to start the
  Cocos extension — Cocos Creator menu → 扩展 → Cocos MCP → 启动 Bridge.
- Use read_console after script edits to spot compile errors.
"""


def build_server() -> FastMCP:
    mcp = FastMCP(name="cocos-mcp", instructions=INSTRUCTIONS)
    register_all_tools(mcp)
    return mcp


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="cocos-mcp",
        description="MCP server for Cocos Creator 2.4",
    )
    p.add_argument("--bridge-host", default=None,
                   help="Host the Cocos extension is listening on. "
                        "Defaults to env COCOS_MCP_BRIDGE_HOST or 127.0.0.1.")
    p.add_argument("--bridge-port", type=int, default=None,
                   help="Port the Cocos extension is listening on. "
                        "Defaults to env COCOS_MCP_BRIDGE_PORT or 6010.")
    p.add_argument("--transport", choices=["stdio", "http"], default="stdio",
                   help="MCP transport (default stdio for Claude Desktop / Claude Code).")
    p.add_argument("--http-host", default="127.0.0.1")
    p.add_argument("--http-port", type=int, default=8765)
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if args.bridge_host:
        config.bridge_host = args.bridge_host
    if args.bridge_port:
        config.bridge_port = args.bridge_port

    logger.info("cocos-mcp v%s starting", config.version)
    logger.info("bridge target: ws://%s:%d/cocosmcp",
                config.bridge_host, config.bridge_port)

    bridge = CocosBridge(host=config.bridge_host, port=config.bridge_port)
    set_global_bridge(bridge)

    server = build_server()

    if args.transport == "http":
        logger.info("starting MCP HTTP transport on %s:%d",
                    args.http_host, args.http_port)
        server.run(transport="http", host=args.http_host, port=args.http_port)
    else:
        logger.info("starting MCP stdio transport")
        server.run(transport="stdio")


if __name__ == "__main__":
    main()
