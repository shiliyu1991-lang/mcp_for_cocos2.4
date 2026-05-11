'use strict';

/**
 * manage_scene — list/open/save/get-current scenes.
 *
 * Actions:
 *   list             enumerate all .fire scenes via assetdb
 *   current          report which scene is currently open in the editor
 *   open             open a scene by url or uuid (delegates to scene-script)
 *   save             save the currently open scene
 *
 * Underlying ops that need to run in the scene context (cc.director, etc.)
 * are forwarded via Editor.Scene.callSceneScript('cocos-mcp', op, ...).
 */

function _callSceneScript(op, args) {
    args = Array.isArray(args) ? args : (args === undefined ? [] : [args]);
    return new Promise((resolve, reject) => {
        if (typeof Editor === 'undefined' || !Editor.Scene || !Editor.Scene.callSceneScript) {
            reject(new Error('Editor.Scene.callSceneScript not available'));
            return;
        }
        const cb = (err, data) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve(data);
        };
        Editor.Scene.callSceneScript.apply(
            Editor.Scene,
            ['cocos-mcp', op].concat(args).concat([cb])
        );
    });
}

function _normUrl(url) {
    if (!url) return url;
    if (url.startsWith('db://')) return url;
    if (url.startsWith('assets/')) return 'db://' + url;
    return url;
}

async function _list() {
    return new Promise((resolve, reject) => {
        Editor.assetdb.queryAssets('db://assets/**/*', 'scene', (err, results) => {
            if (err) { reject(err); return; }
            resolve({
                count: results.length,
                scenes: results.map((r) => ({ url: r.url, uuid: r.uuid, path: r.path })),
            });
        });
    });
}

async function _current() {
    return await _callSceneScript('mcp:scene-current', []);
}

async function _open(params) {
    let uuid = params && params.uuid;
    if (!uuid && params && params.url) {
        uuid = Editor.assetdb.urlToUuid(_normUrl(params.url));
    }
    if (!uuid) throw new Error('manage_scene.open needs uuid or url');
    return new Promise((resolve, reject) => {
        Editor.Scene.open(uuid, (err) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve({ uuid });
        });
    });
}

async function _save() {
    return new Promise((resolve, reject) => {
        Editor.Scene.save((err) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve({ saved: true });
        });
    });
}

const _ops = { list: _list, current: _current, open: _open, save: _save };

async function handle(params, ctx) {
    const action = (params && params.action) || 'current';
    const fn = _ops[action];
    if (!fn) throw new Error('manage_scene: unknown action ' + action + ' (valid: ' + Object.keys(_ops).join(', ') + ')');
    return await fn(params || {});
}

module.exports = { name: 'manage_scene', handle };
