'use strict';

/**
 * manage_asset — query/create/delete/refresh assets using Editor.assetdb.
 *
 * Actions:
 *   list        list assets matching pattern + asset-type
 *   info        full info for url or uuid
 *   read        return text contents (for .js/.json/.txt/.fnt/.proto/.md/.html)
 *   create      create a new asset under db://assets/... with given content
 *   delete      move an asset to trash (irreversible-ish; we still call this
 *               an "explicit-permission" action — the Python wrapper enforces
 *               that, not us)
 *   refresh     reimport a folder (db://assets/foo) and wait for finish
 *
 * Params shape varies per action; see each branch.
 *
 * Returns shapes: see each branch.
 */

const Path = require('path');
const Fs = require('fs');

function _assetdb() {
    if (typeof Editor === 'undefined' || !Editor.assetdb) {
        throw new Error('Editor.assetdb is not available (extension must run inside Cocos Creator)');
    }
    return Editor.assetdb;
}

function _normUrl(url) {
    if (!url) return url;
    if (url.startsWith('db://')) return url;
    if (url.startsWith('assets/')) return 'db://' + url;
    if (url.startsWith('/assets')) return 'db://' + url.slice(1);
    return url;
}

function _readContent(fspath) {
    const stat = Fs.statSync(fspath);
    if (!stat.isFile()) throw new Error('not a regular file: ' + fspath);
    if (stat.size > 1024 * 1024) throw new Error('asset too large to read inline (>1MB): ' + fspath);
    return Fs.readFileSync(fspath, 'utf8');
}

function _list(params) {
    const pattern = (params && params.pattern) || 'db://assets/**/*';
    const typeFilter = (params && params.type) || null; // e.g. "scene", "prefab", "javascript", "texture"
    return new Promise((resolve, reject) => {
        _assetdb().queryAssets(pattern, typeFilter, (err, results) => {
            if (err) { reject(err); return; }
            const limit = Math.min((params && params.limit) || 200, 1000);
            resolve({
                count: results.length,
                returned: Math.min(results.length, limit),
                assets: results.slice(0, limit).map((r) => ({
                    url: r.url, uuid: r.uuid, type: r.type, path: r.path, isSubAsset: !!r.isSubAsset,
                })),
            });
        });
    });
}

function _info(params) {
    const db = _assetdb();
    const uuid = params && params.uuid;
    const url = params && params.url ? _normUrl(params.url) : null;
    let resolvedUuid = uuid;
    if (!resolvedUuid && url) resolvedUuid = db.urlToUuid(url);
    if (!resolvedUuid) throw new Error('manage_asset.info needs uuid or url');
    const info = db.assetInfoByUuid(resolvedUuid);
    if (!info) throw new Error('asset not found: ' + (uuid || url));
    return {
        uuid: resolvedUuid,
        url: db.uuidToUrl(resolvedUuid) || info.url,
        path: db.uuidToFspath(resolvedUuid) || info.path,
        type: info.type,
        isSubAsset: !!info.isSubAsset,
    };
}

function _read(params) {
    const inf = _info(params);
    const text = _readContent(inf.path);
    return { uuid: inf.uuid, url: inf.url, path: inf.path, type: inf.type, content: text };
}

function _create(params) {
    const db = _assetdb();
    const url = _normUrl(params && params.url);
    if (!url) throw new Error('manage_asset.create needs url (e.g. db://assets/foo.js)');
    const content = (params && params.content !== undefined) ? params.content : '';
    return new Promise((resolve, reject) => {
        db.create(url, content, (err, results) => {
            if (err) { reject(err); return; }
            const created = (results || []).map((r) => ({ url: r.url, uuid: r.uuid, type: r.type, path: r.path }));
            resolve({ created });
        });
    });
}

function _delete(params) {
    const db = _assetdb();
    const url = _normUrl(params && params.url);
    if (!url) throw new Error('manage_asset.delete needs url');
    return new Promise((resolve, reject) => {
        db.delete([url], (err, results) => {
            if (err) { reject(err); return; }
            const deleted = (results || []).map((r) => ({ url: r.url, uuid: r.uuid, type: r.type }));
            resolve({ deleted });
        });
    });
}

function _refresh(params) {
    const db = _assetdb();
    const url = _normUrl((params && params.url) || 'db://assets');
    return new Promise((resolve) => {
        db.refresh(url, () => {
            resolve({ refreshed: url });
        });
    });
}

const _ops = {
    list: _list,
    info: _info,
    read: _read,
    create: _create,
    delete: _delete,
    refresh: _refresh,
};

async function handle(params, ctx) {
    const action = (params && params.action) || 'list';
    const fn = _ops[action];
    if (!fn) {
        throw new Error('manage_asset: unknown action ' + action + ' (valid: ' + Object.keys(_ops).join(', ') + ')');
    }
    return await Promise.resolve(fn(params || {}));
}

module.exports = { name: 'manage_asset', handle };
