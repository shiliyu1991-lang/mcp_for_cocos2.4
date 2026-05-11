'use strict';

/**
 * manage_node — query and mutate the active scene's node graph.
 *
 * Heavy lifting runs in the scene context (where cc.director is real) via
 * Editor.Scene.callSceneScript. This handler is a thin parameter forwarder.
 *
 * Actions:
 *   tree                snapshot the scene as a {name, uuid, children[]} tree
 *   get                 fetch a node by uuid (name, position, active, comps[])
 *   set_property        set node.<prop> or node.<comp>.<prop> to a value
 *   create              create a new cc.Node under a parent uuid
 *   delete              remove a node by uuid
 *   add_component       add a component (script class name or built-in) to a node
 *   selection           get the editor's currently-selected node uuids
 *
 * Many ops only make sense when a scene is open. The scene-script is
 * responsible for that check.
 */

function _callSceneScript(op, payload) {
    return new Promise((resolve, reject) => {
        if (typeof Editor === 'undefined' || !Editor.Scene || !Editor.Scene.callSceneScript) {
            reject(new Error('Editor.Scene.callSceneScript not available'));
            return;
        }
        Editor.Scene.callSceneScript('cocos-mcp', op, payload, (err, data) => {
            if (err) { reject(err instanceof Error ? err : new Error(String(err))); return; }
            resolve(data);
        });
    });
}

const _opMap = {
    tree:           'mcp:node-tree',
    get:            'mcp:node-get',
    set_property:   'mcp:node-set-property',
    create:         'mcp:node-create',
    delete:         'mcp:node-delete',
    add_component:  'mcp:node-add-component',
    selection:      'mcp:node-selection',
};

async function handle(params, ctx) {
    const action = (params && params.action) || 'tree';
    const sceneOp = _opMap[action];
    if (!sceneOp) {
        throw new Error('manage_node: unknown action ' + action + ' (valid: ' + Object.keys(_opMap).join(', ') + ')');
    }
    return await _callSceneScript(sceneOp, params || {});
}

module.exports = { name: 'manage_node', handle };
