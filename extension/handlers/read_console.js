'use strict';

/**
 * read_console — return recent Editor console lines from the ring buffer
 * installed by main.js, optionally filtered by level/keyword/since-cursor.
 *
 * Params:
 *   action      "get" | "clear"   (default "get")
 *   levels      array of "log" | "info" | "warn" | "error"  (default all)
 *   contains    substring filter
 *   count       max entries (default 50, max 500)
 *   since       integer cursor returned by a previous call (newer-than)
 *
 * Response (get):
 *   { entries: [{seq, timestamp, level, message}, ...], nextCursor }
 */

async function handle(params, ctx) {
    const buffer = ctx && ctx.consoleBuffer;
    if (!buffer) {
        return {
            entries: [],
            nextCursor: 0,
            note: 'console buffer not initialized — bridge may not be running',
        };
    }

    const action = (params && params.action) || 'get';
    if (action === 'clear') {
        buffer.clear();
        return { cleared: true };
    }
    if (action !== 'get') {
        throw new Error('unknown action: ' + action);
    }

    const levels = Array.isArray(params && params.levels) ? params.levels : null;
    const contains = (params && typeof params.contains === 'string') ? params.contains : null;
    const since = (params && typeof params.since === 'number') ? params.since : undefined;
    let count = (params && Number.isFinite(params.count)) ? Math.floor(params.count) : 50;
    if (count <= 0) count = 50;
    if (count > 500) count = 500;

    let entries = buffer.filter({ levels, contains, since });
    // newest at the end; trim to the last `count`
    if (entries.length > count) entries = entries.slice(entries.length - count);

    const nextCursor = entries.length ? entries[entries.length - 1].seq : (since || 0);

    return { entries, nextCursor, totalBuffered: buffer.all().length };
}

module.exports = { name: 'read_console', handle };
