'use strict';

/**
 * Handler registry — dispatches `frame.command` to the matching module
 * inside this folder. Each handler exports either:
 *
 *   module.exports = { name: 'foo', handle(params, ctx) { ... } };
 *
 * or a top-level async function:
 *
 *   module.exports = async function (params, ctx) { ... };
 *   module.exports.name = 'foo';
 */

const Path = require('path');
const Fs = require('fs');

const _handlers = new Map();
let _loaded = false;

function _autoload() {
    if (_loaded) return;
    _loaded = true;
    const dir = __dirname;
    const files = Fs.readdirSync(dir);
    files.forEach((f) => {
        if (f === 'index.js') return;
        if (!f.endsWith('.js')) return;
        const full = Path.join(dir, f);
        let mod;
        try {
            mod = require(full);
        } catch (e) {
            if (typeof Editor !== 'undefined' && Editor.warn) {
                Editor.warn('[cocos-mcp] failed to load handler ' + f + ': ' + (e && e.message ? e.message : e));
            }
            return;
        }
        const name = (mod && mod.name) || Path.basename(f, '.js');
        const fn = (mod && typeof mod.handle === 'function') ? mod.handle.bind(mod)
                 : (typeof mod === 'function') ? mod
                 : null;
        if (!fn) {
            if (typeof Editor !== 'undefined' && Editor.warn) {
                Editor.warn('[cocos-mcp] handler ' + f + ' has no callable handle()');
            }
            return;
        }
        _handlers.set(name, fn);
    });
}

async function dispatch(frame, ctx) {
    _autoload();
    const fn = _handlers.get(frame.command);
    if (!fn) {
        const known = Array.from(_handlers.keys()).sort().join(', ');
        throw new Error('unknown command: ' + frame.command + ' (known: ' + known + ')');
    }
    const params = (frame && frame.params) || {};
    return await fn(params, ctx);
}

function list() {
    _autoload();
    return Array.from(_handlers.keys()).sort();
}

module.exports = { dispatch, list };
