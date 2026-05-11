# cocosMcp 实现进度与路线图

> 日期：2026-05-11
> 对标：[unity-mcp-beta](D:\AIToolEdit\unityMcp\unity-mcp-beta)（CoplayDev）
> 目标引擎：Cocos Creator 2.4（[官方文档](https://docs.cocos.com/creator/2.4/manual/en/)）
> 配套文件：[`unity-mcp-features.html`](./unity-mcp-features.html)（unity-mcp 的功能/架构清单）

---

## 一、当前已实现（MVP 已完成）

cocosMcp 当前是一个能跑通端到端的最小 MCP 系统，Python ↔ Cocos Creator 编辑器扩展通过本地 WebSocket（默认 `ws://127.0.0.1:6010/cocosmcp`）交换 JSON 帧。

### 1.1 已上线工具（6 个）

| Python tool | Bridge command | 现有能力 | 对标的 unity-mcp 工具 |
| --- | --- | --- | --- |
| `get_project_info` | `get_project_info` | 项目路径、editor 版本、assets 根、前 20 个场景、可用命令列表 | `mcpforunity://project/info` resource |
| `read_console` | `read_console` | 500 条环形缓冲，按 level/contains/since 过滤，get/clear | `read_console` |
| `manage_asset` | `manage_asset` | list / info / read(<1MB) / create / delete / refresh，URL 用 `db://` scheme | `manage_asset`（unity 多了 import/modify/search 分页） |
| `manage_scene` | `manage_scene` | list / current / open / save `.fire` | `manage_scene`（缺 build_settings、validate、close、set_active 等） |
| `manage_node` | `manage_node` | tree / get / set_property / create / delete / add_component / selection | `manage_gameobject` + `manage_components` + `find_gameobjects` 的混合简化版 |
| `execute_script` | `execute_script` | target = main / scene，async IIFE，返回值序列化回传 | `execute_code`（unity 多 history/replay/clear） |

### 1.2 已上线 scene-script ops（9 个）

`mcp:scene-current`, `mcp:node-tree`, `mcp:node-get`, `mcp:node-set-property`, `mcp:node-create`, `mcp:node-delete`, `mcp:node-add-component`, `mcp:node-selection`, `mcp:exec`。

### 1.3 基础设施

- **传输层**：`server/src/transport/ws_client.py` — 单例 WebSocket 客户端，懒重连，按 frame id 配对请求，16MB 最大帧，超时按工具配。
- **扩展启动**：`extension/main.js` — load/unload 生命周期、config.json（host/port/autoStart）、控制台 hook、ws-server 转发、与 panel 的 IPC。
- **控制台 hook**：`extension/lib/console-hook.js` — 一个有 seq 游标的环形缓冲，支持分页查询。
- **面板**：`extension/panel/index.js` — 在 Cocos 编辑器内显示 bridge 状态、端口、连接数，带 Start/Stop/Restart。
- **文档**：`README.md`、`docs/architecture.md`、`docs/adding-tools.md` 都已成文。

### 1.4 与 unity-mcp 共享的核心约定

- 三处同名：Python tool ↔ bridge command ↔ extension handler 文件名。
- 工具体保持 1–10 行，参数走 `action` 分支，不引入基类直到 5+ 工具确有共享。
- 错误如实回传 `{success: false, error}`，不在工具里吞。
- `execute_script` 是逃生口，必须由用户授权破坏性调用。

---

## 二、unity-mcp 有、cocosMcp 还没有的能力（差距清单）

按对 Cocos 2.4 项目实际意义大小排序。每一项都标了**优先级**（P0=马上做 / P1=排进近期 / P2=有人提需求再说 / P3=暂不做）和**Cocos 2.4 文档参考**。

### 2.1 节点 & 组件（P0，最高价值）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `find_nodes` | 按 name / 组件类 / 路径搜节点，返回 uuid + 分页。当前 `manage_node tree` 只能拉整棵树，节点多时数据量爆炸。 | scene-script 里遍历 `cc.director.getScene()`，过滤 `node.name` / `node.getComponent(cls)`；返回 uuid 列表 + 路径。 |
| `manage_component`（独立成工具） | 当前 `manage_node add_component` 只能加，不能删、不能批量设属性、不能读组件状态。 | scene-script 加 `mcp:component-remove`, `mcp:component-set-properties`（一次多 key）, `mcp:component-list`。属性写入时调 `Editor.Scene.applyComponent` 以让 undo 栈正常。文档：[Properties of the Editor Panel](https://docs.cocos.com/creator/2.4/manual/en/scripting/reference/attributes.html)。 |
| `set_property` 支持嵌套结构 | 当前只能赋值简单类型，遇到 `cc.Vec3` / `cc.Color` / 资源引用（`cc.SpriteFrame`）就脆弱。 | 写一个属性序列化层：对 `cc.ValueType` 用类构造、对资源引用按 uuid 走 `Editor.assetdb.loadByUuid`。 |
| Prefab 操作 | 实例化、应用、还原、打开 prefab edit 模式。 | `cc.instantiate(prefab)` + `Editor.Scene.callSceneScript`；prefab edit 模式 Cocos 2.4 是 `Editor.Panel.open('scene', { mode: 'prefab', uuid })`。文档：[Prefab](https://docs.cocos.com/creator/2.4/manual/en/asset-workflow/prefab.html)。 |

### 2.2 资源面（P0–P1）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `manage_asset` 增加 `search` action | unity-mcp 的 search 支持类型、关键字、分页、可选 preview base64。 | `Editor.assetdb.queryAssets(pattern, type)` 已存在，封装好就行。 |
| `manage_asset` 增加 `move` / `rename` / `copy` / `import` | 当前只有 create/delete/refresh，做不了素材重组。 | `Editor.assetdb.move(src, dst)` 与 `Editor.assetdb.import`；`reimport` 用 `Editor.assetdb.refresh(url)`. 文档：[AssetDB API](https://docs.cocos.com/creator/2.4/manual/en/asset-workflow/asset-db.html)。 |
| 资源元数据读写 | 比如 SpriteFrame 切片、Texture 压缩格式、Atlas 设置。 | Cocos 2.4 资源 meta 是 `*.meta` JSON，必须走 `Editor.assetdb.setMetaInfo(uuid, meta)`，**不要**直接写文件。 |
| 脚本 CRUD（`manage_script`） | 创建 / 读 / 改 / 删 项目下 `.js` / `.ts` 脚本。 | 复用 `manage_asset` 即可，外加模板（cc.Component 骨架）。 |
| `find_in_file` | 在脚本里搜内容（含正则）。 | 服务端可直接走 ripgrep / Python 端读 fs，不必走 bridge。 |

### 2.3 编辑器控制（P1）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `manage_editor` | play / pause / stop（预览游戏）、undo / redo、刷新资源、切布局。 | `Editor.Ipc.sendToAll('app:reload')` / `Editor.Scene.callSceneScript('engine', 'play')`；undo/redo: `Editor.UI.fire('engine:undo')`. |
| `execute_menu_item` | 按菜单路径触发编辑器菜单。 | `Editor.MainMenu.execute('Project/Build...')`（Cocos 没有完全等价的菜单路径系统，建议先白名单几个常用项）。 |
| `read_selection` / `set_selection` | unity-mcp 把当前选中做成 resource；cocos 当前只能在 `manage_node selection` 里 get，不能 set。 | `Editor.Selection.select('node', uuid)` / `Editor.Selection.curSelection('node')`. |
| 多实例选择（`set_active_instance`） | unity-mcp 支持一台机器开多个 Unity 同时 MCP。 | Cocos 2.4 多开比较少见，**P3 暂不做**。 |

### 2.4 构建 & 发布（P1）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `manage_build` | 触发构建、切平台、查状态。 | Cocos 2.4 有 [构建发布面板的命令行](https://docs.cocos.com/creator/2.4/manual/en/publish/publish-in-command-line.html)：`CocosCreator --project XXX --build "platform=web-mobile;debug=true"`。在 bridge 里走 `Editor.Ipc.sendToPanel('builder', 'build')` 也可以。 |
| `manage_build profiles` | 构建配置预设管理。 | `settings/builder.json` 文件层级。 |

### 2.5 测试 & 诊断（P2）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `run_tests` | Cocos 2.4 没有内置 TestRunner，但项目里可能有 mocha/jest。 | 在 server 端起子进程跑命令行测试，把输出回传。**先不做 bridge 侧**。 |
| `manage_profiler` | 帧时间、内存、绘制调用。 | Cocos 2.4 引擎运行时有 `cc.debug.setDisplayStats(true)`，但和编辑器期 profiling 不是一回事。**P3 暂不做**。 |
| `preflight` | 在重操作前检查“编译中 / 测试中”。 | Cocos 2.4 资源刷新是异步的，可以 hook `Editor.assetdb.on('refresh')` 状态。 |

### 2.6 反射 & 元信息（P1）

| 缺失 | 描述 | Cocos 2.4 实现要点 |
| --- | --- | --- |
| `cc_reflect` | unity-mcp 的 `unity_reflect` 让 LLM 在写代码前确认类 / 成员存在，防止幻觉。 | Cocos 引擎 API 是 JS，在 scene 上下文里 `Object.keys(cc)`、`Object.getOwnPropertyNames(cc.Node.prototype)` 即可枚举。**做这一个工具的 ROI 很高**——给 LLM 装上“先查再写”习惯。 |
| `cocos_docs` | 抓 cocos 在线手册 / API 文档。 | 走 server 端 HTTP fetch；URL 模式：<br>- 手册：`https://docs.cocos.com/creator/2.4/manual/en/{section}/{page}.html`<br>- API：`https://docs.cocos.com/creator/2.4/api/en/classes/{ClassName}.html`<br>这里要注意 Cocos 文档站可能没开 robots-friendly，先做手册搜索 + 单页抓取。 |

### 2.7 协议层增强（P2，长期）

| 缺失 | 描述 |
| --- | --- |
| Resources（MCP 只读 URI） | 当前 cocosMcp 把 “场景树”“项目信息”都做成了 tool。改成 resource 后 LLM 拉数据语义更干净。优先把 `cocos://project/info`、`cocos://scene/tree`、`cocos://editor/selection` 三个出了。 |
| Tool groups | 按 session 启停工具（unity 的 `manage_tools`）。Cocos 项目里 LLM 一次任务通常只用一小撮工具，能加快 schema 选择。 |
| 服务端 → 客户端 notification | unity 还没做，cocosMcp 的 `console-hook` 实际具备推送条件，未来可作为 streaming console。 |
| Ping / 重连重试 | 当前依赖 ws 库默认。补 10s ping + 域重载（domain reload 等价：cocos 编辑器扩展 reload）后自动重试。 |

### 2.8 unity-mcp 中**不必照搬**到 cocos 的（明确放弃）

- Cinemachine / URP RendererFeatures / Physics2D 矩阵 / ScriptableObject 这些都是 Unity 专属概念，cocos 没有直接对应物。
- ProBuilder / Shader / VFX Graph 同理。
- C# 反射、AssemblyDefinition：cocos 是 JS/TS。
- Test Runner：cocos 2.4 没有内建测试框架。

---

## 三、与 Cocos 2.4 特性挂钩的“原生工具”候选

unity-mcp 没有但 Cocos 2.4 项目特别需要的：

| 候选 tool | 触发场景 | 文档参考 |
| --- | --- | --- |
| `manage_atlas` | 自动图集 / 静态合图。LLM 帮整理 UI 资源时常需要。 | [Auto Atlas](https://docs.cocos.com/creator/2.4/manual/en/asset-workflow/auto-atlas.html) |
| `manage_spriteframe` | 切九宫格、设 trim、设 pivot。 | [SpriteFrame](https://docs.cocos.com/creator/2.4/manual/en/asset-workflow/sprite.html) |
| `manage_animation` | AnimationClip（cocos.AnimationClip）+ Animation 组件。 | [Animation](https://docs.cocos.com/creator/2.4/manual/en/animation/index.html) |
| `manage_tiledmap` | TiledMap 资源关联。 | [TiledMap](https://docs.cocos.com/creator/2.4/manual/en/render/tiledmap.html) |
| `manage_ui` | Widget / Layout / Button 等 UI 组件批量配置。 | [UI System](https://docs.cocos.com/creator/2.4/manual/en/ui/index.html) |
| `manage_i18n` | 本地化字串表（社区插件 / 自研皆有）。 | （视项目） |
| `hot_update_manifest` | 生成热更新 manifest。 | [Hot Update](https://docs.cocos.com/creator/2.4/manual/en/advanced-topics/hot-update.html) |
| `proto_regen` | 项目里 `BuildProto.cmd` 走的那条流程。 | （项目私有） |

注：CLAUDE.md 的 “Open ideas (post-MVP)” 已经把 `manage_prefab`、`manage_component`、`build`、`proto_regen` 列了，本计划与之对齐。

---

## 四、阶段路线图

### Phase 1（近期，1–2 周）——补齐节点 / 资源 / 选区

目标：让 LLM 能稳定完成“做一个新场景，从图集里拖几个 sprite 进去，挂脚本，预览”这一类闭环。

- [ ] `find_nodes`（独立工具，含分页）
- [ ] `manage_component`（独立工具：list / add / remove / set_property，批量 set）
- [ ] `manage_node set_property` 支持 `cc.Vec3` / `cc.Color` / `cc.SpriteFrame` 等富类型
- [ ] `manage_asset` 增加 search / move / rename / copy / set_meta
- [ ] `manage_editor`：play / stop / undo / redo / refresh / set_selection
- [ ] 改 `manage_node selection` → 拆出读 (resource) 与写 (tool)

### Phase 2（中期，2–4 周）——Prefab、构建、反射

- [ ] `manage_prefab`：instantiate / apply / revert / open_edit / close_edit
- [ ] `manage_build`：列平台、触发构建、读 builder.json、查状态
- [ ] `cc_reflect`：scene context 下枚举 cc.* 类和成员
- [ ] `cocos_docs`：抓官方手册 + API 单页

### Phase 3（长期）——协议层 & 项目原生

- [ ] 引入 MCP Resources：把 `project/info`、`scene/tree`、`editor/selection` 转成只读 URI
- [ ] `execute_script` 加 history / replay / clear
- [ ] `manage_atlas` / `manage_animation` / `manage_ui` 等 Cocos 原生工具
- [ ] 自动 ping + 重连 + retry_on_reload
- [ ] streaming console notification（服务端→客户端推送 log）
- [ ] `hot_update_manifest` / `proto_regen`（按项目实际需求）

---

## 五、做事时的纪律（沿用 CLAUDE.md）

1. **对称**：新工具的 `tools/<name>.py`、`handlers/<name>.js`、（如需）`scene-script.js` 里 `mcp:<name>` 三处同名。
2. **不重复造抽象**：在第 5 个真正共享逻辑出现之前不写基类。
3. **每个工具一件事**：超过 6 个 action 就拆。
4. **错误回流**：所有 `await call_bridge` 的 envelope 原样返回，不吞 `success: false`。
5. **资源操作不绕过 assetdb**：`Editor.assetdb.create / delete / refresh / setMetaInfo`，**不要** `fs.writeFileSync` 直接写资源。
6. **scene context 严格隔离**：handlers/*.js 不准 `require('cc')`、不准摸 `cc.director`；所有引擎调用走 `Editor.Scene.callSceneScript('cocos-mcp', op, payload, cb)`。
7. **破坏性 `execute_script` 必须先问用户**，Python 侧不要给 auto-confirm 的默认值。
8. **新增 npm 依赖要克制**：Cocos 2.4 的包隔离脆弱，目前只有 `ws` 一个运行时依赖，能不加就不加。

---

## 六、参考资料

- 配套 HTML：[unity-mcp-features.html](./unity-mcp-features.html) — unity-mcp 完整工具/资源/架构清单
- unity-mcp 源码：`D:\AIToolEdit\unityMcp\unity-mcp-beta`
- Cocos Creator 2.4 手册：<https://docs.cocos.com/creator/2.4/manual/en/>
- Cocos Creator 2.4 编辑器扩展手册：<https://docs.cocos.com/creator/2.4/manual/en/extension/>
- Cocos Creator 2.4 引擎 API：<https://docs.cocos.com/creator/2.4/api/en/>
- cocosMcp 现有架构：[architecture.md](./architecture.md)
- 新增工具流程：[adding-tools.md](./adding-tools.md)
