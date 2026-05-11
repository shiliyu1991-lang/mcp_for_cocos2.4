'use strict';

/**
 * Console capture for read_console.
 *
 * Cocos Creator 2.4's console is fed via Editor.log/info/warn/error.
 * We monkey-patch them so each line is appended to a ring buffer that
 * the read_console handler can dump out on demand.
 *
 * install({capacity}) returns the buffer (with .all/.filter/.clear).
 * uninstall() restores the originals.
 */

const _originals = {};

function _now() {
    return Date.now();
}

function _stringify(args) {
    const parts = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a && a.stack && typeof a.stack === 'string') {
            parts.push(a.stack);
        } else if (typeof a === 'string') {
            parts.push(a);
        } else {
            try {
                parts.push(JSON.stringify(a));
            } catch (e) {
                parts.push(String(a));
            }
        }
    }
    return parts.join(' ');
}

class RingBuffer {
    constructor(capacity) {
        this.capacity = capacity || 500;
        this.entries = [];
        this._seq = 0;
    }
    push(level, message) {
        this._seq++;
        this.entries.push({
            seq: this._seq,
            timestamp: _now(),
            level: level,
            message: message,
        });
        while (this.entries.length > this.capacity) this.entries.shift();
    }
    all() {
        return this.entries.slice();
    }
    filter({ levels, contains, since } = {}) {
        const lv = levels && levels.length ? new Set(levels) : null;
        const needle = contains ? String(contains) : null;
        return this.entries.filter((e) => {
            if (lv && !lv.has(e.level)) return false;
            if (needle && e.message.indexOf(needle) === -1) return false;
            if (typeof since === 'number' && e.seq <= since) return false;
            return true;
        });
    }
    clear() {
        this.entries.length = 0;
    }
}

let _buffer = null;

function install({ capacity } = {}) {
    if (_buffer) return _buffer;
    _buffer = new RingBuffer(capacity || 500);

    if (typeof Editor === 'undefined') {
        // Out of editor (e.g. tests), nothing to hook.
        return _buffer;
    }

    const levels = [
        ['log', 'log'],
        ['info', 'info'],
        ['warn', 'warn'],
        ['error', 'error'],
    ];
    levels.forEach(([fn, level]) => {
        if (typeof Editor[fn] !== 'function') return;
        _originals[fn] = Editor[fn];
        Editor[fn] = function () {
            try {
                _buffer.push(level, _stringify(arguments));
            } catch (e) { /* never let logging crash */ }
            return _originals[fn].apply(Editor, arguments);
        };
    });

    // failed/console messages from outside Editor (e.g. node 'console') go
    // unmonitored — that's a known gap; users who care can `Editor.log` them.

    return _buffer;
}

function uninstall() {
    if (typeof Editor === 'undefined') {
        _buffer = null;
        return;
    }
    Object.keys(_originals).forEach((fn) => {
        try { Editor[fn] = _originals[fn]; } catch (e) { /* ignore */ }
    });
    for (const k in _originals) delete _originals[k];
    _buffer = null;
}

module.exports = { install, uninstall };
