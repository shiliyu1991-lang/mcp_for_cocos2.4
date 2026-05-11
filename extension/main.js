'use strict';

/**
 * Cocos MCP — main process entry
 *
 * Lifecycle:
 *   load()    — boot the WebSocket bridge so a Python MCP server can connect.
 *   unload()  — shut the bridge down cleanly.
 *
 * The bridge listens on ws://127.0.0.1:<port>/cocosmcp and dispatches
 * incoming command frames to handlers/index.js. The protocol is JSON-RPC-ish:
 *
 *   { "id": "<uuid>", "command": "manage_node", "params": { ... } }
 *
 * and replies with:
 *
 *   { "id": "<uuid>", "success": true,  "data":  ... }
 *   { "id": "<uuid>", "success": false, "error": "..." }
 *
 * Heavy console buffering is wired up here too so `read_console` can return
 * recent Editor.log/warn/error/info lines without us having to also run a
 * separate IPC subscription.
 */

const Path = require('path');
const Fs = require('fs');

const WsServer = require('./lib/ws-server');
const ConsoleHook = require('./lib/console-hook');
const Handlers = require('./handlers');

const DEFAULT_PORT = 6010;
const CONFIG_FILE = Path.join(__dirname, 'config.json');

let _bridge = null;
let _consoleBuffer = null;
let _config = null;

function _log() {
    const args = ['[cocos-mcp]'].concat(Array.from(arguments));
    if (typeof Editor !== 'undefined' && Editor.log) {
        Editor.log.apply(Editor, args);
    } else {
        console.log.apply(console, args);
    }
}

function _warn() {
    const args = ['[cocos-mcp]'].concat(Array.from(arguments));
    if (typeof Editor !== 'undefined' && Editor.warn) {
        Editor.warn.apply(Editor, args);
    } else {
        console.warn.apply(console, args);
    }
}

function _readConfig() {
    if (_config) return _config;
    let cfg = { port: DEFAULT_PORT, host: '127.0.0.1', autoStart: true };
    try {
        if (Fs.existsSync(CONFIG_FILE)) {
            const raw = Fs.readFileSync(CONFIG_FILE, 'utf8');
            Object.assign(cfg, JSON.parse(raw));
        }
    } catch (e) {
        _warn('failed to read config.json:', e && e.message ? e.message : e);
    }
    _config = cfg;
    return _config;
}

function _writeConfig(patch) {
    const cfg = Object.assign({}, _readConfig(), patch || {});
    _config = cfg;
    try {
        Fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        _warn('failed to write config.json:', e && e.message ? e.message : e);
    }
}

function _startBridge() {
    if (_bridge) {
        _log('bridge already running on', _bridge.url());
        return;
    }
    const cfg = _readConfig();

    _consoleBuffer = ConsoleHook.install({ capacity: 500 });

    const ctx = {
        consoleBuffer: _consoleBuffer,
        log: _log,
        warn: _warn,
        packageName: 'cocos-mcp',
    };

    _bridge = new WsServer({ host: cfg.host, port: cfg.port });
    _bridge.on('command', (frame, reply) => {
        Handlers.dispatch(frame, ctx).then((result) => {
            reply({ id: frame.id, success: true, data: result });
        }).catch((err) => {
            reply({
                id: frame.id,
                success: false,
                error: (err && err.message) ? err.message : String(err),
                stack: (err && err.stack) ? String(err.stack) : undefined,
            });
        });
    });
    _bridge.on('listening', (info) => {
        _log('bridge listening on', info.url);
    });
    _bridge.on('error', (err) => {
        _warn('bridge error:', err && err.message ? err.message : err);
    });

    _bridge.start();
}

function _stopBridge() {
    if (!_bridge) {
        _log('bridge is not running');
        return;
    }
    _bridge.stop();
    _bridge = null;
    if (_consoleBuffer) {
        ConsoleHook.uninstall();
        _consoleBuffer = null;
    }
    _log('bridge stopped');
}

function _bridgeStatus() {
    const cfg = _readConfig();
    if (_bridge) {
        return {
            running: true,
            url: _bridge.url(),
            host: cfg.host,
            port: cfg.port,
            clients: _bridge.clientCount(),
        };
    }
    return { running: false, host: cfg.host, port: cfg.port };
}

module.exports = {
    load() {
        const cfg = _readConfig();
        if (cfg.autoStart) {
            try {
                _startBridge();
            } catch (e) {
                _warn('auto-start failed:', e && e.message ? e.message : e);
            }
        } else {
            _log('autoStart is disabled, skipping bridge boot');
        }
    },

    unload() {
        try {
            _stopBridge();
        } catch (e) {
            _warn('unload error:', e && e.message ? e.message : e);
        }
    },

    messages: {
        'open-panel'() {
            Editor.Panel.open('cocos-mcp');
        },
        'start-bridge'() {
            try {
                _startBridge();
            } catch (e) {
                _warn('start-bridge failed:', e && e.message ? e.message : e);
            }
        },
        'stop-bridge'() {
            _stopBridge();
        },
        'status'(event) {
            const s = _bridgeStatus();
            _log('status:', JSON.stringify(s));
            if (event && event.reply) event.reply(null, s);
        },
        // Panel asks main for live status.
        'panel-status'(event) {
            if (event && event.reply) event.reply(null, _bridgeStatus());
        },
        'panel-set-port'(event, port) {
            const p = parseInt(port, 10);
            if (!Number.isFinite(p) || p <= 0 || p > 65535) {
                if (event && event.reply) event.reply(new Error('invalid port'));
                return;
            }
            _writeConfig({ port: p });
            if (event && event.reply) event.reply(null, _readConfig());
        },
        'panel-set-autostart'(event, value) {
            _writeConfig({ autoStart: !!value });
            if (event && event.reply) event.reply(null, _readConfig());
        },
        'panel-restart'(event) {
            try {
                _stopBridge();
                _startBridge();
                if (event && event.reply) event.reply(null, _bridgeStatus());
            } catch (e) {
                if (event && event.reply) event.reply(e);
            }
        },
    },
};
