# mcpforcocos 路线图

> 上次修订：2026-05-14
> 旧版（2.4 单引擎、对标 unity-mcp 的全功能 gap 清单）已删除；这份是当前实际推进顺序。

## 当前状态

端到端跑通的最小系统：

| 工具 | 2.4 | 3.x | 状态 |
|---|:-:|:-:|---|
| `get_project_info` | ✅ | ✅ | 项目元数据 + 场景列表 |
| `read_console` | ✅ | ✅ | 500 条环形缓冲，按 level/contains/since 过滤 |
| `manage_scene` (`list/current/open/save`) | ✅ | ✅ | 场景级操作 |
| `manage_node` | ⏳ | ⏳ | 节点 CRUD（最高优先级） |
| `manage_asset` | ⏳ | ⏳ | 资源 CRUD（含 search/move/rename） |
| `execute_script` | ⏳ | ⏳ | 任意 JS 逃生口（需用户确认） |

基础设施：
- **传输**：Python 内嵌 WS server@6010，Cocos 插件作 client 拨号；JSON 帧 `{id, command, params}` / `{id, success, data/error}`。
- **协议对称**：handler 在 `cocos-mcp-2x/main.js` 和 `cocos-mcp-3x/main.js` 各写一份，Python `services/tools/<name>.py` 共用。
- **零 npm**：两个插件都是粘贴即用，WebSocket 客户端手写嵌进 `main.js`。

## Phase 1（近期）—— 节点 / 组件

让 LLM 能稳定完成"开个新场景，从场景里挑节点改属性，挂个组件，预览"这条最常见闭环。

- [ ] `manage_node`：tree / get / set_property / create / delete / add_component / selection
  - 3.x 用 `Editor.Message.request('scene', 'query-node-tree' | 'query-node' | 'set-property' | 'create-node' | 'remove-node' | 'create-component', ...)`，几乎全是内置端点，无需自定义 scene-script
  - 2.4 走 `cocos-mcp-2x/scene-script.js`，加 `'mcp:node-*'` 一组入口
- [ ] `find_nodes`：按 name / 组件类 / 路径搜节点 + 分页（避免 `tree` 一次返回上千节点）
- [ ] `set_property` 支持富类型：`Vec3` / `Color` / 资源引用（`SpriteFrame` 等）

## Phase 2（中期）—— 资源 / 选区 / 编辑器控制

- [ ] `manage_asset`：list / info / read / create / delete / refresh / move / rename / search
  - 3.x：`Editor.Message.request('asset-db', 'query-assets' | 'query-asset-info' | 'create-asset' | 'delete-asset' | 'move-asset' | 'refresh-asset', ...)`
  - 2.4：`Editor.assetdb.queryAssets / create / delete / refresh / move`
- [ ] `manage_editor`：play / pause / stop / undo / redo / refresh / set_selection
- [ ] `read_selection` / `set_selection`：`Editor.Selection`

## Phase 3（长期）—— Prefab / 构建 / 反射

- [ ] `manage_prefab`：instantiate / apply / revert / open_edit / close_edit
- [ ] `manage_build`：列平台、触发构建、读 builder.json、查状态
- [ ] `cc_reflect`：枚举 cc.* 类与成员，给 LLM 装上"先查再写"的习惯
- [ ] `execute_script`：scene/main 两种 target，async IIFE，结果 JSON 回传（必须用户授权）

## 协议层增强（机会主义）

- [ ] MCP Resources：`cocos://project/info`、`cocos://scene/tree`、`cocos://editor/selection` 三个只读 URI
- [ ] streaming console：把 `read_console` 的环形缓冲做成 server→client notification 推送
- [ ] ping / 自动重连：当前断线后用户要手动点【连接】，可以加 panel 端 watchdog 自动重拨

## 不做（已明确放弃）

- Cocos 2.4 不打算回到 v0.1 的"扩展自己起 WS server、Python 反向 dial-in"模式 —— v0.2 的 client 模式更干净，端口冲突也少。
- Unity-mcp 里的 Cinemachine / URP RendererFeatures / ProBuilder / Test Runner 这些 Unity 专属概念不照搬。

## 设计纪律（沿用 CLAUDE.md）

1. **对称**：Python tool 名 == bridge command 名 == handler 键名。
2. **最小抽象**：handler body 一般 5-30 行，超 6 个 action 就拆。
3. **错误回流**：handler 抛出的 `Error` 原样变成 `{success:false, error}`，不在工具里吞 `success: False`。
4. **资源不绕 assetdb**：`Editor.assetdb.create / delete / refresh`（2.4）或 `asset-db` message 通道（3.x），**不要** `fs.writeFileSync` 直写文件。
5. **scene context 严格隔离**：`main.js` 里不能 `require('cc')`、不准摸 `cc.director`；走 scene-script（2.4）或内置 scene 模块（3.x）。
6. **不引 npm 依赖**：两个插件都是 paste-and-go，WebSocket 客户端已经手写嵌入 `main.js`。
