'use strict';

/**
 * Cocos MCP — control panel.
 *
 * Shows bridge status (running/host/port/clients), lets the user toggle
 * autoStart, change port, and start/stop the bridge. Talks to main.js via
 * Editor.Ipc.sendToMain('cocos-mcp:panel-*'). Pure Vue 1 (the in-Editor
 * runtime that ships with Cocos Creator 2.4).
 */

Editor.Panel.extend({
    style: `
        :host { display: flex; flex-direction: column; padding: 10px; font-family: Arial, sans-serif; color: #ddd; }
        .row { display: flex; align-items: center; margin: 6px 0; gap: 8px; }
        .label { width: 96px; color: #aaa; }
        .value { flex: 1; }
        .btnrow { display: flex; gap: 8px; margin-top: 12px; }
        button { padding: 6px 14px; border-radius: 4px; border: 1px solid #555; background: #333; color: #ddd; cursor: pointer; }
        button:hover { background: #444; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        input[type=number] { width: 90px; background: #222; color: #ddd; border: 1px solid #555; padding: 4px; }
        .hint { font-size: 11px; color: #888; margin-top: 8px; }
        h3 { margin: 0 0 8px 0; font-size: 14px; color: #fff; }
    `,

    template: `
        <h3>Cocos MCP Bridge</h3>
        <div class="row">
            <span class="label">状态:</span>
            <span class="value" v-bind:class="{ 'status-on': running, 'status-off': !running }">
                {{ running ? '运行中' : '已停止' }}
            </span>
        </div>
        <div class="row">
            <span class="label">URL:</span>
            <span class="value">{{ url }}</span>
        </div>
        <div class="row">
            <span class="label">已连接:</span>
            <span class="value">{{ clients }} 个客户端</span>
        </div>
        <div class="row">
            <span class="label">端口:</span>
            <input type="number" v-model="port" min="1" max="65535" />
            <button v-on:click="onApplyPort">应用</button>
        </div>
        <div class="row">
            <span class="label">编辑器启动时:</span>
            <label><input type="checkbox" v-model="autoStart" v-on:change="onToggleAutoStart" /> 自动启动 Bridge</label>
        </div>
        <div class="btnrow">
            <button v-on:click="onStart" v-if="!running">启动</button>
            <button v-on:click="onStop" v-if="running">停止</button>
            <button v-on:click="onRestart">重启</button>
            <button v-on:click="onRefresh">刷新</button>
        </div>
        <div class="hint">
            修改端口后请点【重启】。<br>
            Python MCP server 默认会连接 ws://127.0.0.1:6010/cocosmcp。
        </div>
    `,

    ready() {
        const self = this;
        this.$vue = new window.Vue({
            el: this.shadowRoot,
            data: {
                running: false,
                url: '',
                clients: 0,
                port: 6010,
                autoStart: true,
            },
            methods: {
                onStart() { self._send('cocos-mcp:start-bridge'); setTimeout(() => self._refresh(), 500); },
                onStop() { self._send('cocos-mcp:stop-bridge'); setTimeout(() => self._refresh(), 300); },
                onRefresh() { self._refresh(); },
                onRestart() {
                    self._call('cocos-mcp:panel-restart', null, () => self._refresh());
                },
                onApplyPort() {
                    self._call('cocos-mcp:panel-set-port', this.port, () => self._refresh());
                },
                onToggleAutoStart() {
                    self._call('cocos-mcp:panel-set-autostart', this.autoStart, () => self._refresh());
                },
            },
        });
        this._refresh();
    },

    _send(msg, payload) {
        if (payload === undefined) Editor.Ipc.sendToMain(msg);
        else Editor.Ipc.sendToMain(msg, payload);
    },

    _call(msg, payload, cb) {
        const args = [msg];
        if (payload !== null && payload !== undefined) args.push(payload);
        args.push((err, data) => { if (cb) cb(err, data); });
        Editor.Ipc.sendToMain.apply(Editor.Ipc, args);
    },

    _refresh() {
        const self = this;
        Editor.Ipc.sendToMain('cocos-mcp:panel-status', (err, status) => {
            if (err || !status || !self.$vue) return;
            self.$vue.running = !!status.running;
            self.$vue.url = status.url || ('ws://' + (status.host || '127.0.0.1') + ':' + (status.port || 6010) + '/cocosmcp');
            self.$vue.clients = status.clients || 0;
            if (status.port) self.$vue.port = status.port;
        });
    },

    messages: {
        // future: bridge events could be pushed here as panel messages.
    },
});
