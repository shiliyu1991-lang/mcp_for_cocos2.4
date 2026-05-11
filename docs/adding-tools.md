# 加一个新工具

以 `manage_prefab` 为例（假设你想新增一个工具列出所有 prefab，并在场景里实例化）。

## 1. Extension 端：加 handler

`extension/handlers/manage_prefab.js`：

```js
'use strict';

function _list() {
    return new Promise((resolve, reject) => {
        Editor.assetdb.queryAssets('db://assets/**/*', 'prefab', (err, results) => {
            if (err) { reject(err); return; }
            resolve({
                count: results.length,
                prefabs: results.map((r) => ({ url: r.url, uuid: r.uuid })),
            });
        });
    });
}

function _instantiate(params) {
    return new Promise((resolve, reject) => {
        Editor.Scene.callSceneScript('cocos-mcp', 'mcp:prefab-instantiate', params,
            (err, data) => err ? reject(err) : resolve(data));
    });
}

const _ops = { list: _list, instantiate: _instantiate };

async function handle(params /* , ctx */) {
    const action = (params && params.action) || 'list';
    const fn = _ops[action];
    if (!fn) throw new Error('manage_prefab: unknown action ' + action);
    return await fn(params || {});
}

module.exports = { name: 'manage_prefab', handle };
```

`instantiate` 需要 scene 上下文，所以加一个 op 到 `extension/scene-script.js`：

```js
ops['mcp:prefab-instantiate'] = function (event, payload) {
    try {
        const uuid = payload && payload.uuid;
        if (!uuid) { event.reply(new Error('uuid required')); return; }
        cc.assetManager.loadAny({ uuid, type: cc.Prefab }, (err, prefab) => {
            if (err) { event.reply(err); return; }
            const node = cc.instantiate(prefab);
            const parent = (payload && payload.parentUuid) ? _findByUuid(payload.parentUuid) : _scene();
            if (!parent) { event.reply(new Error('parent not found')); return; }
            parent.addChild(node);
            event.reply(null, { uuid: node.uuid, name: node.name, parentUuid: parent.uuid });
        });
    } catch (e) { event.reply(e); }
};
```

## 2. Python 端：加 tool

`server/src/services/tools/manage_prefab.py`：

```python
from typing import Annotated, Any, Literal
from fastmcp import Context

from services.registry import cocos_mcp_tool
from services.tools._common import call_bridge


@cocos_mcp_tool(
    description=(
        "Operate on prefabs.\n\n"
        "Actions:\n"
        "  list         - enumerate all .prefab assets.\n"
        "  instantiate  - instantiate a prefab into the open scene under "
        "`parent_uuid` (default = scene root).\n"
    ),
)
async def manage_prefab(
    ctx: Context,
    action: Annotated[Literal["list", "instantiate"], "Operation."],
    uuid: Annotated[str | None, "Prefab uuid for `instantiate`."] = None,
    parent_uuid: Annotated[str | None, "Parent node uuid (defaults to scene root)."] = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"action": action}
    if uuid is not None:
        params["uuid"] = uuid
    if parent_uuid is not None:
        params["parentUuid"] = parent_uuid
    return await call_bridge("manage_prefab", params)
```

## 3. 重启

* 在 Cocos Creator 里：菜单【扩展 → Cocos MCP → 停止 Bridge】然后【启动 Bridge】，或者重启整个编辑器。
* 重启 Python server。

## 4. 验证

让 Claude 调用一次：

```
manage_prefab(action="list")
```

返回应该包含 `success: true, data: { count: N, prefabs: [...] }`。

## 命名约定

* handler 文件名 == `module.exports.name` == Python tool 函数名 == 协议里的 `command`。
* 多动作工具用 `action` 字段，不要拆成 `manage_node_tree`、`manage_node_get` 之类（unity-mcp 也是这套）。
* 异步 / 长耗时操作（构建、热更新）记得在 Python 那边传 `timeout=`。
