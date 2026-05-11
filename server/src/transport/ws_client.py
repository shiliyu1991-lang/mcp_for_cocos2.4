"""WebSocket transport between the MCP server and the Cocos extension.

The bridge is a single, lazily-connected client to the editor extension.
We give every outbound frame a uuid and resolve a Future when the matching
reply comes back. If the socket dies, the next request will reconnect
automatically (with a small backoff).

This module is async and thread-safe enough for FastMCP's worker model: the
single asyncio event loop owns the websocket, all tools `await` it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Optional

import websockets

from core.config import config

logger = logging.getLogger("cocos-mcp.bridge")


class BridgeError(Exception):
    """Raised when the extension reports a structured error."""


class BridgeUnavailable(Exception):
    """Raised when we cannot reach the extension at all."""


def _is_open(ws):
    """Best-effort 'is this websocket still usable?' for both legacy and new
    websockets connection objects. websockets >=13 removed `.closed` from the
    new asyncio API; we fall back to `.state` (CONNECTING/OPEN/CLOSING/CLOSED).
    """
    if ws is None:
        return False
    try:
        closed = getattr(ws, "closed", None)
    except Exception:
        closed = None
    if closed is not None:
        return not closed
    state = getattr(ws, "state", None)
    if state is not None:
        try:
            return int(state) == 1 or getattr(state, "name", "") == "OPEN"
        except Exception:
            return True
    return True


class CocosBridge:
    def __init__(self, host, port, path=None):
        self._host = host
        self._port = port
        self._path = path or config.bridge_path
        self._ws = None
        self._lock = asyncio.Lock()
        self._pending = {}
        self._reader_task = None
        self._closed = False

    @property
    def url(self):
        return f"ws://{self._host}:{self._port}{self._path}"

    async def _ensure_connected(self):
        async with self._lock:
            if _is_open(self._ws):
                return self._ws
            try:
                logger.debug("connecting to %s", self.url)
                self._ws = await asyncio.wait_for(
                    websockets.connect(self.url, max_size=16 * 1024 * 1024),
                    timeout=config.connect_timeout,
                )
            except (OSError, asyncio.TimeoutError) as exc:
                raise BridgeUnavailable(
                    f"could not connect to Cocos MCP bridge at {self.url}: {exc}. "
                    "Make sure Cocos Creator is open and the extension's Bridge "
                    "is started (扩展 → Cocos MCP → 启动 Bridge)."
                ) from exc
            self._reader_task = asyncio.create_task(self._reader_loop(self._ws))
            return self._ws

    async def _reader_loop(self, ws):
        try:
            async for raw in ws:
                try:
                    frame = json.loads(raw)
                except Exception:
                    logger.warning("non-JSON frame from extension: %r", raw[:200])
                    continue
                if isinstance(frame, dict) and frame.get("type") == "hello":
                    logger.debug("bridge hello: %s", frame)
                    continue
                rid = frame.get("id") if isinstance(frame, dict) else None
                if not rid:
                    logger.debug("frame without id, ignored: %s", frame)
                    continue
                fut = self._pending.pop(rid, None)
                if not fut or fut.done():
                    continue
                fut.set_result(frame)
        except websockets.ConnectionClosed:
            pass
        except Exception:
            logger.exception("reader loop crashed")
        finally:
            for fut in list(self._pending.values()):
                if not fut.done():
                    fut.set_exception(BridgeUnavailable("bridge connection lost"))
            self._pending.clear()
            self._ws = None

    async def call(self, command, params=None, timeout=None):
        ws = await self._ensure_connected()
        rid = str(uuid.uuid4())
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._pending[rid] = fut
        frame = {"id": rid, "command": command, "params": params or {}}
        try:
            await ws.send(json.dumps(frame))
        except websockets.ConnectionClosed as exc:
            self._pending.pop(rid, None)
            raise BridgeUnavailable(f"send failed: {exc}") from exc

        try:
            reply = await asyncio.wait_for(fut, timeout=timeout or config.request_timeout)
        except asyncio.TimeoutError as exc:
            self._pending.pop(rid, None)
            raise BridgeUnavailable(
                f"timeout waiting for reply to '{command}' after "
                f"{timeout or config.request_timeout}s"
            ) from exc

        if not isinstance(reply, dict):
            raise BridgeError(f"non-object reply from extension: {reply!r}")
        if reply.get("success"):
            return reply.get("data")
        message = reply.get("error") or "unknown error"
        stack = reply.get("stack")
        if stack:
            logger.debug("bridge error stack:\n%s", stack)
        raise BridgeError(f"{command}: {message}")

    async def close(self):
        self._closed = True
        ws = self._ws
        self._ws = None
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass


_global_bridge = None


def set_global_bridge(b):
    global _global_bridge
    _global_bridge = b


def get_bridge():
    if _global_bridge is None:
        return CocosBridge(host=config.bridge_host, port=config.bridge_port)
    return _global_bridge
