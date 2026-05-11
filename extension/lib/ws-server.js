'use strict';

/**
 * Tiny WebSocket server wrapper.
 *
 * Wraps the `ws` package and emits a high-level `command` event for each
 * fully-parsed frame. Falls back to a meaningful error when `ws` is not
 * installed yet — the panel uses that to prompt the user to run `npm install`.
 */

const EventEmitter = require('events');

let WebSocketServer = null;
let _wsLoadError = null;
try {
    WebSocketServer = require('ws').Server;
} catch (e) {
    _wsLoadError = e;
}

class WsServer extends EventEmitter {
    constructor(opts) {
        super();
        this._host = (opts && opts.host) || '127.0.0.1';
        this._port = (opts && opts.port) || 6010;
        this._wss = null;
    }

    url() {
        return 'ws://' + this._host + ':' + this._port + '/cocosmcp';
    }

    clientCount() {
        if (!this._wss) return 0;
        let n = 0;
        this._wss.clients.forEach(() => { n++; });
        return n;
    }

    start() {
        if (this._wss) return;
        if (!WebSocketServer) {
            const msg = '[cocos-mcp] `ws` module not installed. Run `npm install ws@^8` inside the extension/ directory.';
            const err = new Error(msg);
            if (_wsLoadError) err.cause = _wsLoadError;
            this.emit('error', err);
            throw err;
        }

        const wss = new WebSocketServer({ host: this._host, port: this._port, path: '/cocosmcp' });
        this._wss = wss;

        wss.on('listening', () => {
            this.emit('listening', { url: this.url(), host: this._host, port: this._port });
        });

        wss.on('error', (err) => {
            this.emit('error', err);
        });

        wss.on('connection', (ws, req) => {
            const remote = (req && req.socket && req.socket.remoteAddress) || 'unknown';
            this.emit('connect', { remote });

            ws.on('message', (raw) => {
                let frame;
                try {
                    frame = JSON.parse(raw.toString('utf8'));
                } catch (e) {
                    ws.send(JSON.stringify({
                        id: null,
                        success: false,
                        error: 'invalid JSON: ' + (e && e.message ? e.message : e),
                    }));
                    return;
                }
                if (!frame || typeof frame !== 'object') {
                    ws.send(JSON.stringify({
                        id: null, success: false, error: 'frame must be a JSON object',
                    }));
                    return;
                }
                if (typeof frame.command !== 'string' || !frame.command) {
                    ws.send(JSON.stringify({
                        id: frame.id || null,
                        success: false,
                        error: 'frame.command is required',
                    }));
                    return;
                }
                const reply = (response) => {
                    try {
                        ws.send(JSON.stringify(response));
                    } catch (e) {
                        // socket may have closed mid-flight
                    }
                };
                this.emit('command', frame, reply);
            });

            ws.on('close', () => {
                this.emit('disconnect', { remote });
            });

            ws.on('error', (err) => {
                this.emit('clientError', err);
            });

            // Greet
            try {
                ws.send(JSON.stringify({
                    type: 'hello',
                    server: 'cocos-mcp',
                    version: 1,
                }));
            } catch (e) { /* ignore */ }
        });
    }

    stop() {
        if (!this._wss) return;
        try { this._wss.close(); } catch (e) { /* ignore */ }
        this._wss = null;
    }
}

module.exports = WsServer;
