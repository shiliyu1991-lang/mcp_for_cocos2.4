'use strict';

/**
 * get_project_info — read static project metadata.
 *
 * Returns the project root path, the engine/editor version Cocos Creator
 * advertises, the count of scene assets, and the list of asset roots.
 * Used by AI assistants as a sanity check that the bridge is alive and
 * to discover where assets live before issuing other commands.
 */

const Path = require('path');
const Fs = require('fs');

function _safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
}

async function handle(params, ctx) {
    const projectPath = _safe(() => Editor.Project.path, null);
    const editorVersion = _safe(() => Editor.versions && (Editor.versions.editor || Editor.versions['cocos-creator']), null);
    const assetsRoot = projectPath ? Path.join(projectPath, 'assets') : null;

    let sceneCount = 0;
    let firstScenes = [];
    if (typeof Editor !== 'undefined' && Editor.assetdb && Editor.assetdb.queryAssets) {
        sceneCount = await new Promise((resolve) => {
            Editor.assetdb.queryAssets('db://assets/**/*', 'scene', (err, results) => {
                if (err || !Array.isArray(results)) { resolve(0); return; }
                firstScenes = results.slice(0, 20).map((r) => ({
                    url: r.url, uuid: r.uuid, path: r.path,
                }));
                resolve(results.length);
            });
        });
    }

    const handlersList = require('./index').list();

    return {
        projectPath,
        assetsRoot,
        editorVersion,
        sceneCount,
        firstScenes,
        availableCommands: handlersList,
        bridgeVersion: 1,
    };
}

module.exports = { name: 'get_project_info', handle };
