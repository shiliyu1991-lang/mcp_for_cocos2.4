'use strict';

/**
 * Cocos MCP panel (2.4) — Connect / Disconnect to a Python MCP server.
 *
 * Uses the 2.4 panel API:
 *   Editor.Panel.extend({ style, template, ready, methods })
 * with Vue 1 bound to `this.shadowRoot` (Cocos 2.4 ships Vue 1 in-editor).
 *
 * Talks to main.js over Editor.Ipc:
 *   - 'cocos-mcp-2x:panel-status'      → returns {connected, url, lastError}
 *   - 'cocos-mcp-2x:panel-connect'(url)→ same shape
 *   - 'cocos-mcp-2x:panel-disconnect'  → same shape
 */

const PACKAGE_NAME = 'cocos-mcp-2x';
const DEFAULT_URL = 'ws://127.0.0.1:6010/cocosmcp';

Editor.Panel.extend({

    style: `
        :host { display: flex; flex-direction: column; padding: 12px; color: #ddd; font-family: Arial, sans-serif; }
        h3 { margin: 0 0 8px 0; color: #fff; font-size: 14px; }
        .row { display: flex; align-items: center; margin: 6px 0; gap: 8px; }
        .label { width: 96px; color: #aaa; }
        .value { flex: 1; }
        .err { color: #ff9a76; word-break: break-all; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        .btnrow { display: flex; gap: 8px; margin-top: 10px; }
        button { padding: 6px 14px; border-radius: 4px; border: 1px solid #555; background: #333; color: #ddd; cursor: pointer; }
        button:hover { background: #444; }
        button.primary { background: #4a6; border-color: #4a6; color: #111; }
        input[type=text] { flex: 1; background: #222; color: #ddd; border: 1px solid #555; padding: 4px; }
        .hint { font-size: 11px; color: #888; margin-top: 12px; line-height: 1.5; }
    `,

    template: `
        <h3>Cocos MCP (2.4)</h3>

        <div class="row">
            <span class="label">服务器 URL:</span>
            <input type="text" v-model="url" />
        </div>

        <div class="row">
            <span class="label">状态:</span>
            <span class="value" v-bind:class="{ 'status-on': connected, 'status-off': !connected }">
                {{ connected ? '已连接' : '未连接' }}
            </span>
        </div>

        <div class="row" v-if="lastError">
            <span class="label">上次错误:</span>
            <span class="value err">{{ lastError }}</span>
        </div>

        <div class="btnrow">
            <button class="primary" v-on:click="onConnect">连接</button>
            <button v-on:click="onDisconnect">断开</button>
            <button v-on:click="onRefresh">刷新</button>
        </div>

        <div class="hint">
            先启动 Python MCP server（默认监听 ws://127.0.0.1:6010/cocosmcp），<br>
            然后回到这里点【连接】。<br>
            连接断开后 Python 端的 tool 调用会返回 bridge_unavailable，点【连接】可重新拨号。
        </div>
    `,

    ready() {
        const self = this;
        this.$vue = new window.Vue({
            el: this.shadowRoot,
            data: {
                connected: false,
                url: DEFAULT_URL,
                lastError: '',
            },
            methods: {
                onConnect() {
                    Editor.Ipc.sendToMain(
                        PACKAGE_NAME + ':panel-connect',
                        this.url,
                        (err, s) => self._render(err, s)
                    );
                },
                onDisconnect() {
                    Editor.Ipc.sendToMain(
                        PACKAGE_NAME + ':panel-disconnect',
                        (err, s) => self._render(err, s)
                    );
                },
                onRefresh() { self._refresh(); },
            },
        });
        this._refresh();
        this._timer = setInterval(() => self._refresh(), 2000);
    },

    close() {
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },

    _refresh() {
        const self = this;
        Editor.Ipc.sendToMain(PACKAGE_NAME + ':panel-status', (err, s) => {
            self._render(err, s);
        });
    },

    _render(err, s) {
        if (!this.$vue) return;
        if (err) { this.$vue.lastError = String(err && err.message || err); return; }
        if (!s) return;
        this.$vue.connected = !!s.connected;
        // Only adopt server-side URL when the input doesn't have focus, so
        // we don't clobber the user's typing.
        if (s.url) {
            const focused = (this.shadowRoot && this.shadowRoot.activeElement &&
                this.shadowRoot.activeElement.tagName === 'INPUT');
            if (!focused) this.$vue.url = s.url;
        }
        this.$vue.lastError = s.lastError || '';
    },

    messages: {
        // No incoming panel messages right now; reserved for future use.
    },
});
