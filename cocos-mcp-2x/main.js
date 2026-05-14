'use strict';

/**
 * Cocos MCP (2.4) — single-file extension, no npm dependencies.
 *
 * Mirror image of cocos-mcp-3x/main.js. Same protocol, same shape; the
 * differences from 3.x are all in the editor APIs we call:
 *   - Editor.assetdb (callback-style) instead of Editor.Message.request
 *   - Editor.log/info/warn/error hook instead of console.* hook
 *   - Editor.Scene.callSceneScript instead of execute-scene-script
 *   - Editor.Ipc / messages: {} dispatch instead of exports.methods
 *
 * Contents (top → bottom):
 *   1. Minimal WebSocket client (RFC 6455, text frames, no `ws` package).
 *   2. Console ring buffer for read_console (hooks Editor.log/warn/error).
 *   3. Three command handlers: get_project_info, read_console, manage_scene.
 *   4. Extension lifecycle (load/unload) + panel IPC handlers.
 */

const net = require('net');
const crypto = require('crypto');
const Path = require('path');
const { EventEmitter } = require('events');

const PACKAGE_NAME = 'cocos-mcp-2x';
const DEFAULT_URL = 'ws://127.0.0.1:6010/cocosmcp';
const MAX_FRAME = 16 * 1024 * 1024;
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ----------------------------------------------------------------------- //
// 1. Minimal WebSocket client (text frames only)
// ----------------------------------------------------------------------- //

class WsClient extends EventEmitter {
    constructor() {
        super();
        this._socket = null;
        this._buf = Buffer.alloc(0);
        this._handshakeDone = false;
        this._expectedAccept = null;
    }

    connect(urlStr) {
        const m = /^ws:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(urlStr);
        if (!m) {
            setImmediate(() => this.emit('error', new Error('invalid ws:// url: ' + urlStr)));
            return;
        }
        const host = m[1];
        const port = parseInt(m[2] || '80', 10);
        const path = m[3] || '/';

        const key = crypto.randomBytes(16).toString('base64');
        this._expectedAccept = crypto.createHash('sha1')
            .update(key + WS_GUID).digest('base64');

        const socket = net.createConnection({ host: host, port: port });
        this._socket = socket;
        socket.setNoDelay(true);

        socket.on('connect', () => {
            const req =
                'GET ' + path + ' HTTP/1.1\r\n' +
                'Host: ' + host + ':' + port + '\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                'Sec-WebSocket-Key: ' + key + '\r\n' +
                'Sec-WebSocket-Version: 13\r\n' +
                '\r\n';
            socket.write(req);
        });

        socket.on('data', (chunk) => {
            try { this._onData(chunk); }
            catch (e) { this.emit('error', e); this._teardown(); }
        });
        socket.on('error', (err) => this.emit('error', err));
        socket.on('close', () => {
            this._handshakeDone = false;
            this.emit('close');
        });
    }

    _onData(chunk) {
        this._buf = Buffer.concat([this._buf, chunk]);

        if (!this._handshakeDone) {
            const end = this._buf.indexOf(Buffer.from('\r\n\r\n'));
            if (end === -1) return;
            const header = this._buf.slice(0, end).toString('utf8');
            this._buf = this._buf.slice(end + 4);
            if (!/^HTTP\/1\.[01] 101/i.test(header)) {
                this.emit('error', new Error('handshake failed: ' + header.split('\r\n')[0]));
                this._teardown(); return;
            }
            const am = header.match(/Sec-WebSocket-Accept:\s*(.+)/i);
            if (!am || am[1].trim() !== this._expectedAccept) {
                this.emit('error', new Error('handshake failed: bad Sec-WebSocket-Accept'));
                this._teardown(); return;
            }
            this._handshakeDone = true;
            this.emit('open');
        }

        while (true) {
            if (this._buf.length < 2) return;
            const b0 = this._buf[0], b1 = this._buf[1];
            const fin = (b0 & 0x80) !== 0;
            const opcode = b0 & 0x0f;
            const masked = (b1 & 0x80) !== 0;
            let len = b1 & 0x7f;
            let offset = 2;
            if (len === 126) {
                if (this._buf.length < 4) return;
                len = this._buf.readUInt16BE(2); offset = 4;
            } else if (len === 127) {
                if (this._buf.length < 10) return;
                const hi = this._buf.readUInt32BE(2);
                const lo = this._buf.readUInt32BE(6);
                if (hi !== 0 || lo > MAX_FRAME) {
                    this.emit('error', new Error('frame too large'));
                    this._teardown(); return;
                }
                len = lo; offset = 10;
            }
            let mask = null;
            if (masked) {
                if (this._buf.length < offset + 4) return;
                mask = this._buf.slice(offset, offset + 4);
                offset += 4;
            }
            if (this._buf.length < offset + len) return;
            let payload = this._buf.slice(offset, offset + len);
            this._buf = this._buf.slice(offset + len);
            if (masked) {
                const u = Buffer.alloc(len);
                for (let i = 0; i < len; i++) u[i] = payload[i] ^ mask[i & 3];
                payload = u;
            }
            if (opcode === 0x1 && fin) {
                this.emit('message', payload.toString('utf8'));
            } else if (opcode === 0x8) {
                try { this._writeFrame(0x8, Buffer.alloc(0)); } catch (e) {}
                this._teardown(); return;
            } else if (opcode === 0x9) {
                try { this._writeFrame(0xa, payload); } catch (e) {}
            }
        }
    }

    _writeFrame(opcode, data) {
        if (!this._socket || this._socket.destroyed) return;
        const len = data.length;
        let header;
        if (len < 126) {
            header = Buffer.alloc(2 + 4);
            header[0] = 0x80 | opcode; header[1] = 0x80 | len;
        } else if (len < 65536) {
            header = Buffer.alloc(4 + 4);
            header[0] = 0x80 | opcode; header[1] = 0x80 | 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10 + 4);
            header[0] = 0x80 | opcode; header[1] = 0x80 | 127;
            header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6);
        }
        const maskKey = crypto.randomBytes(4);
        maskKey.copy(header, header.length - 4);
        const out = Buffer.alloc(header.length + len);
        header.copy(out, 0);
        for (let i = 0; i < len; i++) out[header.length + i] = data[i] ^ maskKey[i & 3];
        this._socket.write(out);
    }

    send(text) {
        if (!this._handshakeDone) throw new Error('ws not connected');
        this._writeFrame(0x1, Buffer.from(String(text), 'utf8'));
    }

    close() {
        if (this._socket && !this._socket.destroyed && this._handshakeDone) {
            try { this._writeFrame(0x8, Buffer.alloc(0)); } catch (e) {}
        }
        this._teardown();
    }

    _teardown() {
        if (this._socket) {
            try { this._socket.end(); } catch (e) {}
            try { this._socket.destroy(); } catch (e) {}
            this._socket = null;
        }
        this._handshakeDone = false;
    }
}

// ----------------------------------------------------------------------- //
// 2. Console capture (hooks Editor.log/info/warn/error)
// ----------------------------------------------------------------------- //

const _consoleOriginals = {};
let _consoleBuffer = null;
const CONSOLE_CAPACITY = 500;

function _stringifyArg(a) {
    if (a && a.stack && typeof a.stack === 'string') return a.stack;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
}

function _installConsoleHook() {
    if (_consoleBuffer) return;
    _consoleBuffer = { entries: [], seq: 0, capacity: CONSOLE_CAPACITY };
    if (typeof Editor === 'undefined') return;
    [['log','log'], ['info','info'], ['warn','warn'], ['error','error']].forEach((p) => {
        const fn = p[0], level = p[1];
        if (typeof Editor[fn] !== 'function') return;
        _consoleOriginals[fn] = Editor[fn];
        Editor[fn] = function () {
            try {
                _consoleBuffer.seq++;
                _consoleBuffer.entries.push({
                    seq: _consoleBuffer.seq,
                    timestamp: Date.now(),
                    level: level,
                    message: Array.prototype.slice.call(arguments).map(_stringifyArg).join(' '),
                });
                while (_consoleBuffer.entries.length > _consoleBuffer.capacity) {
                    _consoleBuffer.entries.shift();
                }
            } catch (e) { /* never let logging crash */ }
            return _consoleOriginals[fn].apply(Editor, arguments);
        };
    });
}

function _uninstallConsoleHook() {
    if (typeof Editor === 'undefined') { _consoleBuffer = null; return; }
    Object.keys(_consoleOriginals).forEach((k) => {
        try { Editor[k] = _consoleOriginals[k]; } catch (e) { /* ignore */ }
    });
    for (const k in _consoleOriginals) delete _consoleOriginals[k];
    _consoleBuffer = null;
}

// ----------------------------------------------------------------------- //
// 3. Tiny helpers + command handlers
// ----------------------------------------------------------------------- //

function _safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
function _normUrl(u) {
    if (!u) return u;
    if (u.startsWith('db://')) return u;
    if (u.startsWith('assets/')) return 'db://' + u;
    if (u.startsWith('/assets')) return 'db://' + u.slice(1);
    return u;
}

function _callSceneScript(op, payload) {
    return new Promise((resolve, reject) => {
        if (typeof Editor === 'undefined' || !Editor.Scene || !Editor.Scene.callSceneScript) {
            reject(new Error('Editor.Scene.callSceneScript not available')); return;
        }
        Editor.Scene.callSceneScript(PACKAGE_NAME, op, payload, (err, data) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve(data);
        });
    });
}

const handlers = {

    async get_project_info(/* params */) {
        const projectPath = _safe(() => Editor.Project.path, null);
        const editorVersion = _safe(() => {
            const v = Editor.versions || {};
            return v.editor || v['cocos-creator'] || null;
        }, null);

        const scenes = await new Promise((resolve) => {
            if (!Editor.assetdb || !Editor.assetdb.queryAssets) { resolve([]); return; }
            Editor.assetdb.queryAssets('db://assets/**/*', 'scene', (err, results) => {
                resolve((!err && Array.isArray(results)) ? results : []);
            });
        });

        return {
            engine: '2.4',
            projectPath: projectPath,
            assetsRoot: projectPath ? Path.join(projectPath, 'assets') : null,
            editorVersion: editorVersion,
            sceneCount: scenes.length,
            firstScenes: scenes.slice(0, 20).map((r) => ({
                url: r.url, uuid: r.uuid, path: r.path,
            })),
            availableCommands: Object.keys(handlers).sort(),
            bridgeVersion: 2,
        };
    },

    async read_console(params) {
        params = params || {};
        if (!_consoleBuffer) {
            return { entries: [], nextCursor: 0, note: 'console hook not active' };
        }
        if (params.action === 'clear') {
            _consoleBuffer.entries.length = 0;
            return { cleared: true };
        }
        const levels = Array.isArray(params.levels) && params.levels.length
            ? new Set(params.levels) : null;
        const contains = (typeof params.contains === 'string') ? params.contains : null;
        const since = (typeof params.since === 'number') ? params.since : -1;
        let count = Number.isFinite(params.count) ? Math.floor(params.count) : 50;
        if (count <= 0) count = 50;
        if (count > 500) count = 500;
        let entries = _consoleBuffer.entries.filter((e) => {
            if (levels && !levels.has(e.level)) return false;
            if (contains && e.message.indexOf(contains) === -1) return false;
            if (e.seq <= since) return false;
            return true;
        });
        if (entries.length > count) entries = entries.slice(entries.length - count);
        const nextCursor = entries.length ? entries[entries.length - 1].seq : Math.max(since, 0);
        return { entries: entries, nextCursor: nextCursor, totalBuffered: _consoleBuffer.entries.length };
    },

    async manage_scene(params) {
        params = params || {};
        const action = params.action || 'current';

        if (action === 'list') {
            const results = await new Promise((resolve, reject) => {
                Editor.assetdb.queryAssets('db://assets/**/*', 'scene', (err, r) => {
                    if (err) { reject(err); return; }
                    resolve(Array.isArray(r) ? r : []);
                });
            });
            return {
                count: results.length,
                scenes: results.map((r) => ({ url: r.url, uuid: r.uuid, path: r.path })),
            };
        }

        if (action === 'current') {
            // 2.4 has no main-process API for "what scene is open"; ask
            // scene-script.js which has cc.director in scope.
            return await _callSceneScript('mcp:scene-current', {});
        }

        if (action === 'open') {
            let uuid = params.uuid;
            if (!uuid && params.url) {
                uuid = Editor.assetdb.urlToUuid(_normUrl(params.url));
            }
            if (!uuid) throw new Error('manage_scene.open needs uuid or url');
            await new Promise((resolve, reject) => {
                Editor.Scene.open(uuid, (err) => {
                    if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
                    resolve();
                });
            });
            return { uuid: uuid };
        }

        if (action === 'save') {
            await new Promise((resolve, reject) => {
                Editor.Scene.save((err) => {
                    if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
                    resolve();
                });
            });
            return { saved: true };
        }

        throw new Error('manage_scene: unknown action "' + action +
            '" (valid: list, current, open, save)');
    },
};

// ----------------------------------------------------------------------- //
// 4. Bridge wiring
// ----------------------------------------------------------------------- //

let _ws = null;
let _connected = false;
let _url = DEFAULT_URL;
let _lastError = null;

function _connectionState() {
    return { connected: _connected, url: _url, lastError: _lastError };
}

function _handleFrame(raw) {
    let frame;
    try { frame = JSON.parse(raw); } catch (e) { return; }
    if (!frame || typeof frame !== 'object') return;
    if (frame.type === 'hello') return;
    if (typeof frame.command !== 'string' || !frame.id) return;

    const fn = handlers[frame.command];
    const reply = (resp) => {
        try { if (_ws) _ws.send(JSON.stringify(resp)); } catch (e) { /* ignore */ }
    };
    if (!fn) {
        reply({
            id: frame.id, success: false,
            error: 'unknown command: ' + frame.command +
                ' (known: ' + Object.keys(handlers).sort().join(', ') + ')',
        });
        return;
    }
    Promise.resolve()
        .then(() => fn(frame.params || {}))
        .then((data) => reply({ id: frame.id, success: true, data: data }))
        .catch((e) => reply({
            id: frame.id, success: false,
            error: (e && e.message) ? e.message : String(e),
            stack: (e && e.stack) ? String(e.stack) : undefined,
        }));
}

function _connect(url) {
    if (typeof url === 'string' && url.trim()) _url = url.trim();
    if (_ws) {
        try { _ws.close(); } catch (e) { /* ignore */ }
        _ws = null;
    }
    return new Promise((resolve) => {
        let settled = false;
        const ws = new WsClient();

        const onOpen = () => {
            if (settled) return; settled = true;
            _ws = ws;
            _connected = true;
            _lastError = null;
            try {
                ws.send(JSON.stringify({ type: 'hello', client: PACKAGE_NAME, engine: '2.4' }));
            } catch (e) { /* ignore */ }
            resolve(_connectionState());
        };
        const onErr = (err) => {
            _lastError = (err && err.message) ? err.message : String(err);
            if (settled) return; settled = true;
            _connected = false; _ws = null;
            resolve(_connectionState());
        };
        const onClose = () => {
            _connected = false;
            if (_ws === ws) _ws = null;
            if (settled) return; settled = true;
            if (!_lastError) _lastError = 'closed before open';
            resolve(_connectionState());
        };

        ws.on('open', onOpen);
        ws.on('error', onErr);
        ws.on('close', onClose);
        ws.on('message', _handleFrame);

        try { ws.connect(_url); } catch (e) { onErr(e); }
    });
}

function _disconnect() {
    if (_ws) { try { _ws.close(); } catch (e) {} _ws = null; }
    _connected = false;
}

// ----------------------------------------------------------------------- //
// 5. Extension lifecycle + IPC (2.4 style: messages map)
// ----------------------------------------------------------------------- //

module.exports = {

    load() {
        _installConsoleHook();
        if (typeof Editor !== 'undefined' && Editor.log) {
            Editor.log('[' + PACKAGE_NAME + '] loaded — open the panel and click Connect.');
        }
    },

    unload() {
        _disconnect();
        _uninstallConsoleHook();
    },

    messages: {

        // Menu entry
        'open-panel'() {
            Editor.Panel.open(PACKAGE_NAME);
        },

        // Panel → main IPC
        'panel-status'(event) {
            if (event && event.reply) event.reply(null, _connectionState());
        },
        'panel-connect'(event, url) {
            _connect(url).then((s) => {
                if (event && event.reply) event.reply(null, s);
            }).catch((e) => {
                if (event && event.reply) event.reply(e);
            });
        },
        'panel-disconnect'(event) {
            _disconnect();
            if (event && event.reply) event.reply(null, _connectionState());
        },
    },
};
