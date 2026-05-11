'use strict';

/**
 * execute_script — escape hatch for one-off automation.
 *
 * Two execution targets:
 *   "main"  — runs `(async () => { <code> })()` inside the extension's
 *             main process. Has access to Editor.* APIs (assetdb, log, etc.)
 *             but NOT to cc.director / scene nodes.
 *   "scene" — forwards the snippet to scene-script.js, where cc.director
 *             and the live scene are available.
 *
 * The result is whatever the snippet returns (must be JSON-serializable).
 *
 * SAFETY NOTE: this is a deliberately powerful primitive — the Python
 * wrapper marks it as requiring explicit user permission. Don't use it
 * for things where a typed handler exists.
 */

const Util = require('util');

function _exec_main(code) {
    if (typeof code !== 'string' || !code.trim()) {
        throw new Error('execute_script: `code` must be a non-empty string');
    }
    // eslint-disable-next-line no-new-func
    const wrapped = new Function('Editor', 'require', '__dirname',
        '"use strict"; return (async () => {\n' + code + '\n})();');
    return Promise.resolve(wrapped(typeof Editor !== 'undefined' ? Editor : undefined, require, __dirname))
        .then((value) => ({ ok: true, value: _safeSerialize(value) }))
        .catch((err) => { throw err; });
}

function _exec_scene(code) {
    if (typeof code !== 'string' || !code.trim()) {
        throw new Error('execute_script: `code` must be a non-empty string');
    }
    return new Promise((resolve, reject) => {
        Editor.Scene.callSceneScript('cocos-mcp', 'mcp:exec', { code }, (err, data) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve({ ok: true, value: data });
        });
    });
}

function _safeSerialize(v) {
    if (v === undefined) return null;
    try {
        // round-trip to make sure the result is JSON-clean
        return JSON.parse(JSON.stringify(v));
    } catch (e) {
        return Util.inspect(v, { depth: 4, breakLength: 120 });
    }
}

async function handle(params, ctx) {
    const target = (params && params.target) || 'main';
    const code = params && params.code;
    if (target === 'main') return await _exec_main(code);
    if (target === 'scene') return await _exec_scene(code);
    throw new Error('execute_script: unknown target ' + target + ' (valid: main, scene)');
}

module.exports = { name: 'execute_script', handle };
