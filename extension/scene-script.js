'use strict';

/**
 * scene-script.js — runs in the Cocos Creator scene context.
 *
 * Cocos Creator 2.4 loads this module inside the renderer process where
 * `cc`, `cc.director`, the active scene, and node graph are real. The
 * extension's main process forwards "mcp:*" operations here via
 * Editor.Scene.callSceneScript('cocos-mcp', op, payload, callback).
 *
 * Conventions:
 *   - All handlers receive (event, payload) where `event.reply(err, data)`
 *     sends the result back to main.
 *   - Throwing or calling reply(err) sends a structured error.
 *   - All node references are by `uuid`. We accept a missing uuid for
 *     "operate on the scene root" where it makes sense.
 */

function _scene() {
    if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene) {
        throw new Error('cc.director not available — is a scene open?');
    }
    const s = cc.director.getScene();
    if (!s) throw new Error('no scene is currently open');
    return s;
}

function _findByUuid(uuid) {
    if (!uuid) return _scene();
    const root = _scene();
    if (root.uuid === uuid) return root;
    const stack = [root];
    while (stack.length) {
        const n = stack.pop();
        if (n.uuid === uuid) return n;
        const cs = n.children || [];
        for (let i = 0; i < cs.length; i++) stack.push(cs[i]);
    }
    return null;
}

function _summarizeNode(node, depth, maxDepth) {
    const out = {
        uuid: node.uuid,
        name: node.name,
        active: node.active,
        children: [],
    };
    if (depth < maxDepth) {
        const cs = node.children || [];
        for (let i = 0; i < cs.length; i++) {
            out.children.push(_summarizeNode(cs[i], depth + 1, maxDepth));
        }
    } else {
        out.childCount = (node.children && node.children.length) || 0;
    }
    return out;
}

function _comp_summary(c) {
    const cls = (c && c.constructor) ? c.constructor : null;
    return {
        uuid: c.uuid,
        type: (cls && cls.name) || (c.__classname__ || 'Component'),
        enabled: !!c.enabled,
    };
}

function _node_detail(node) {
    const pos = node.position || (node.getPosition && node.getPosition());
    const components = (node._components || []).map(_comp_summary);
    return {
        uuid: node.uuid,
        name: node.name,
        active: node.active,
        position: pos ? { x: pos.x, y: pos.y, z: pos.z || 0 } : null,
        rotation: node.rotation,
        scale: node.scale ? { x: node.scaleX || node.scale.x, y: node.scaleY || node.scale.y } : null,
        anchor: { x: node.anchorX, y: node.anchorY },
        size: { width: node.width, height: node.height },
        children: (node.children || []).map((c) => ({ uuid: c.uuid, name: c.name })),
        components,
        parentUuid: node.parent ? node.parent.uuid : null,
    };
}

const ops = {};

ops['mcp:scene-current'] = function (event /*, payload */) {
    try {
        if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene) {
            event.reply(null, { hasScene: false });
            return;
        }
        const s = cc.director.getScene();
        if (!s) { event.reply(null, { hasScene: false }); return; }
        event.reply(null, {
            hasScene: true,
            uuid: s.uuid,
            name: s.name,
            childCount: (s.children || []).length,
        });
    } catch (e) { event.reply(e); }
};

ops['mcp:node-tree'] = function (event, payload) {
    try {
        const maxDepth = (payload && Number.isFinite(payload.maxDepth)) ? payload.maxDepth : 6;
        const root = (payload && payload.uuid) ? _findByUuid(payload.uuid) : _scene();
        if (!root) { event.reply(new Error('node not found: ' + payload.uuid)); return; }
        event.reply(null, _summarizeNode(root, 0, maxDepth));
    } catch (e) { event.reply(e); }
};

ops['mcp:node-get'] = function (event, payload) {
    try {
        const n = _findByUuid(payload && payload.uuid);
        if (!n) { event.reply(new Error('node not found: ' + (payload && payload.uuid))); return; }
        event.reply(null, _node_detail(n));
    } catch (e) { event.reply(e); }
};

ops['mcp:node-set-property'] = function (event, payload) {
    try {
        const n = _findByUuid(payload && payload.uuid);
        if (!n) { event.reply(new Error('node not found: ' + (payload && payload.uuid))); return; }
        const path = payload.property; // dotted, e.g. "position.x" or "cc.Sprite.spriteFrame"
        if (!path || typeof path !== 'string') { event.reply(new Error('property is required (string)')); return; }
        const value = payload.value;
        const parts = path.split('.');
        let target = n;
        // If first part matches a component class, find it via getComponent
        if (parts.length > 1 && cc[parts[0]] && typeof n.getComponent === 'function') {
            const comp = n.getComponent(cc[parts[0]]);
            if (comp) { target = comp; parts.shift(); }
        }
        for (let i = 0; i < parts.length - 1; i++) {
            target = target[parts[i]];
            if (target == null) { event.reply(new Error('intermediate property is null: ' + parts.slice(0, i+1).join('.'))); return; }
        }
        target[parts[parts.length - 1]] = value;
        event.reply(null, { uuid: n.uuid, set: path, value });
    } catch (e) { event.reply(e); }
};

ops['mcp:node-create'] = function (event, payload) {
    try {
        const parent = (payload && payload.parentUuid) ? _findByUuid(payload.parentUuid) : _scene();
        if (!parent) { event.reply(new Error('parent not found: ' + (payload && payload.parentUuid))); return; }
        const node = new cc.Node((payload && payload.name) || 'NewNode');
        if (payload && payload.position) {
            const p = payload.position;
            node.setPosition(p.x || 0, p.y || 0, p.z || 0);
        }
        parent.addChild(node);
        event.reply(null, { uuid: node.uuid, name: node.name, parentUuid: parent.uuid });
    } catch (e) { event.reply(e); }
};

ops['mcp:node-delete'] = function (event, payload) {
    try {
        const n = _findByUuid(payload && payload.uuid);
        if (!n) { event.reply(new Error('node not found: ' + (payload && payload.uuid))); return; }
        if (n === _scene()) { event.reply(new Error('cannot delete the scene root')); return; }
        const uuid = n.uuid;
        const name = n.name;
        n.destroy();
        event.reply(null, { deleted: { uuid, name } });
    } catch (e) { event.reply(e); }
};

ops['mcp:node-add-component'] = function (event, payload) {
    try {
        const n = _findByUuid(payload && payload.uuid);
        if (!n) { event.reply(new Error('node not found: ' + (payload && payload.uuid))); return; }
        const className = payload && payload.className;
        if (!className) { event.reply(new Error('className is required')); return; }
        const comp = n.addComponent(className);
        if (!comp) { event.reply(new Error('addComponent returned null for ' + className)); return; }
        event.reply(null, _comp_summary(comp));
    } catch (e) { event.reply(e); }
};

ops['mcp:node-selection'] = function (event /*, payload */) {
    try {
        let uuids = [];
        if (typeof Editor !== 'undefined' && Editor.Selection && Editor.Selection.curSelection) {
            uuids = Editor.Selection.curSelection('node') || [];
        }
        const nodes = uuids.map((u) => {
            const n = _findByUuid(u);
            return n ? { uuid: n.uuid, name: n.name } : { uuid: u, missing: true };
        });
        event.reply(null, { count: uuids.length, nodes });
    } catch (e) { event.reply(e); }
};

ops['mcp:exec'] = function (event, payload) {
    try {
        const code = payload && payload.code;
        if (typeof code !== 'string' || !code.trim()) { event.reply(new Error('code must be a non-empty string')); return; }
        // eslint-disable-next-line no-new-func
        const fn = new Function('cc', 'Editor', 'scene',
            '"use strict"; return (async () => {\n' + code + '\n})();');
        Promise.resolve(fn(typeof cc !== 'undefined' ? cc : undefined,
                          typeof Editor !== 'undefined' ? Editor : undefined,
                          (function () { try { return _scene(); } catch (e) { return null; } })()))
            .then((v) => {
                let safe = v;
                try { safe = JSON.parse(JSON.stringify(v === undefined ? null : v)); }
                catch (e) { safe = String(v); }
                event.reply(null, safe);
            })
            .catch((e) => event.reply(e));
    } catch (e) { event.reply(e); }
};

module.exports = ops;
