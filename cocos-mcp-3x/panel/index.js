'use strict';

/**
 * Cocos MCP panel — Connect / Disconnect to a Python MCP server.
 *
 * Polls main.js#panelStatus every 2 seconds so a manual disconnect or a
 * server-side close gets reflected without the user clicking refresh.
 */

const PACKAGE_NAME = 'cocos-mcp-3x';
const DEFAULT_URL = 'ws://127.0.0.1:6010/cocosmcp';

module.exports = {
    template: `
        <section class="mcp-panel">
            <h3>Cocos MCP</h3>

            <div class="row">
                <span class="label">服务器 URL:</span>
                <ui-input id="url-input" value="${DEFAULT_URL}"></ui-input>
            </div>

            <div class="row">
                <span class="label">状态:</span>
                <span id="status-text" class="value status-off">未连接</span>
            </div>

            <div class="row" id="err-row" style="display:none">
                <span class="label">上次错误:</span>
                <span id="err-text" class="value err"></span>
            </div>

            <div class="row btns">
                <ui-button id="btn-connect" class="primary">连接</ui-button>
                <ui-button id="btn-disconnect">断开</ui-button>
                <ui-button id="btn-refresh">刷新</ui-button>
            </div>

            <div class="hint">
                先启动 Python MCP server（默认会监听 ws://127.0.0.1:6010/cocosmcp），<br>
                然后回到这里点【连接】。<br>
                连接断开后 Python 端的 tool 调用会返回 bridge_unavailable，点【连接】可重新拨号。
            </div>
        </section>
    `,
    style: `
        section.mcp-panel { display: flex; flex-direction: column; padding: 12px; color: #ddd; font-family: Arial, sans-serif; }
        h3 { margin: 0 0 8px 0; color: #fff; font-size: 14px; }
        .row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
        .label { width: 96px; color: #aaa; }
        .value { flex: 1; }
        .err { color: #ff9a76; word-break: break-all; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        .btns { margin-top: 10px; }
        .hint { font-size: 11px; color: #888; margin-top: 12px; line-height: 1.5; }
        ui-input { flex: 1; }
    `,
    $: {
        urlInput:      '#url-input',
        statusText:    '#status-text',
        errRow:        '#err-row',
        errText:       '#err-text',
        btnConnect:    '#btn-connect',
        btnDisconnect: '#btn-disconnect',
        btnRefresh:    '#btn-refresh',
    },
    methods: {
        async refresh() {
            try {
                const s = await Editor.Message.request(PACKAGE_NAME, 'panel-status');
                this._render(s);
            } catch (e) { /* extension may not be loaded yet */ }
        },
        _render(s) {
            if (!s) return;
            const c = !!s.connected;
            this.$.statusText.textContent = c ? '已连接' : '未连接';
            this.$.statusText.classList.toggle('status-on', c);
            this.$.statusText.classList.toggle('status-off', !c);
            if (s.url && this.$.urlInput && !this.$.urlInput.matches(':focus')) {
                this.$.urlInput.value = s.url;
            }
            if (s.lastError) {
                this.$.errRow.style.display = '';
                this.$.errText.textContent = s.lastError;
            } else {
                this.$.errRow.style.display = 'none';
                this.$.errText.textContent = '';
            }
        },
    },
    async ready() {
        const self = this;
        const req = (msg, ...args) => Editor.Message.request(PACKAGE_NAME, msg, ...args);

        this.$.btnConnect.addEventListener('confirm', async () => {
            const url = self.$.urlInput.value || DEFAULT_URL;
            const s = await req('panel-connect', url);
            self._render(s);
        });
        this.$.btnDisconnect.addEventListener('confirm', async () => {
            const s = await req('panel-disconnect');
            self._render(s);
        });
        this.$.btnRefresh.addEventListener('confirm', () => self.refresh());

        await self.refresh();
        self._timer = setInterval(() => self.refresh(), 2000);
    },
    close() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    },
};
