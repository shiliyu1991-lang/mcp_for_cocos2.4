'use strict';

/**
 * scene-script.js (2.4) — runs in Cocos Creator's scene/renderer context,
 * where `cc`, `cc.director`, and the live node graph are real.
 *
 * Forwarded into from main.js via:
 *   Editor.Scene.callSceneScript('cocos-mcp-2x', 'mcp:scene-current', payload, cb)
 *
 * Only one op for now — manage_scene `current`. Add new ops here when we
 * port manage_node / execute_script / etc. to 2.4.
 */

module.exports = {

    'mcp:scene-current'(event /*, payload */) {
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
        } catch (e) {
            event.reply(e);
        }
    },
};
