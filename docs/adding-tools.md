# 加一个新工具

> 当前正式说明在 [CLAUDE.md](../CLAUDE.md) 的 "Adding a tool" 一节。
> 这份文档保留下来是因为它给了一个稍长一点的例子。

## 1. Editor 端

往对应版本 `main.js` 的 `handlers = { ... }` 对象里加一个键：

- **2.4** → `cocos-mcp-2x/main.js`，用回调式 `Editor.assetdb.*` / `Editor.Scene.callSceneScript`
- **3.x** → `cocos-mcp-3x/main.js`，用 Promise 式 `Editor.Message.request(...)`

最小例子（3.x，列出所有 prefab）：

```js
// cocos-mcp-3x/main.js 里 handlers 对象内
async manage_prefab(params) {
    params = params || {};
    if ((params.action || 'list') === 'list') {
        const r = await Editor.Message.request('asset-db', 'query-assets', {
            pattern: 'db://assets/**/*',
            ccType: 'cc.Prefab',
        });
        const arr = Array.isArray(r) ? r : [];
        return {
            count: arr.length,
            prefabs: arr.map((s) => ({ url: s.source, uuid: s.uuid })),
        };
    }
    throw new Error('manage_prefab: unknown action');
},
```

2.4 等价（回调式）：

```js
// cocos-mcp-2x/main.js 里 handlers 对象内
async manage_prefab(params) {
    params = params || {};
    if ((params.action || 'list') === 'list') {
        const arr = await new Promise((res, rej) => {
            Editor.assetdb.queryAssets('db://assets/**/*', 'prefab',
                (e, r) => e ? rej(e) : res(r || []));
        });
        return {
            count: arr.length,
            prefabs: arr.map((r) => ({ url: r.url, uuid: r.uuid })),
        };
    }
    throw new Error('manage_prefab: unknown action');
},
```

需要 `cc.director`（如：`cc.instantiate(prefab)` 实例化）：
- 2.4 必须在 `cocos-mcp-2x/scene-script.js` 里加一个 `'mcp:prefab-instantiate'` 入口，main.js 里用 `_callSceneScript('mcp:prefab-instantiate', payload)` 转发。
- 3.x 内置 `scene` 模块大多场景够用（`create-node`、`set-property` 等）；只有真的需要在 renderer 上下文跑代码时才加 scene-script，并在 `package.json#contributions.scene.script` 指向它。

## 2. Python 端（2.4 / 3.x 共用）

`server/src/services/tools/<name>.py`：

```python
from services.registry import cocos_mcp_tool
from services.tools._common import call_bridge

@cocos_mcp_tool(description="manage prefabs (list / instantiate / apply)")
async def manage_prefab(ctx, action: str = "list", uuid: str | None = None,
                         parentUuid: str | None = None) -> dict:
    return await call_bridge("manage_prefab", {
        "action": action,
        "uuid": uuid,
        "parentUuid": parentUuid,
    })
```

文件直接放在 `services/tools/`，启动时自动发现。

## 3. 重启

- Cocos：菜单 **开发者 → 重载扩展**（或重启编辑器）
- Python：Ctrl+C 后重新跑 `python -m main ...`，或者让 Claude Desktop / Cursor 重新 spawn

工具名 = bridge command 名 = 函数键名，三处保持一致。

---

## 命名 / 设计纪律

- **对称**：Python tool 名 == bridge command 名 == handler 键名。
- **最小抽象**：handler body 一般 5-30 行，参数走 `action` 分支；不要为了"复用"早早抽基类。
- **错误如实回流**：抛出的 `Error` 会原样变成 `{success:false, error}`，不要在 handler 里 `try/catch` 然后吞掉。
- **破坏性操作问用户**：`execute_script` 这种逃生口，Python wrapper 里不要给 auto-confirm 默认值。
