# Agent Note: Editable Center File Viewer with fs.write and VS2019 Dark Styling

Status: implemented

[English](2026-08-14-file-viewer-edit-save-vs2019-dark.md) | 中文

## Problem

vscodeUI fork 的中央文件查看器原本是只读的：在资源管理器中点击文件后，其文本显示在一个只读的 textarea 中，用户只能查看并选中代码加入 AI 对话，却无法直接在界面上修改拼写或调整某一行。宿主 fs 域只暴露了 `fs.list` 与 `fs.read`。用户提出两点要求：打开的文件必须可以编辑；文件编辑页面需要采用 Visual Studio 2019 Dark 的配色与 Consolas 字体。

## Decision

### 增加 fs.write 远程调用

apiproxy fs 域新增 `fs.write`，请求负载为 `{ path, content }`，响应值为写入后的路径。实现沿用读取侧的路径规则（必须为完全限定路径），拒绝指向非普通文件的路径；完整结果上限作用于整个写入：超过 1 MiB 写入上限的内容会被拒绝而非截断，因此保存永远不会静默截断查看器整读的文件。失败以新增的 `file-unwritable` 错误码呈现并携带路径。该 RPC 贯穿每一层标准环节：`FsApi`、请求/响应 zod schema、`rpc-map` 条目、handler 路由、fetch-client 方法与值 schema、`api-proxy` 实现，以及 `writeFsFile` 列表辅助函数。

客户端运行时通过 `IFs.write` 投影该动词，由 `FsRuntime` 基于 wire client 实现；离线 fixture 与两个 fake-api 同步补齐，保证测试与无密钥运行时的完整表面。

### 基于 CodeMirror 6 的可编辑查看器

查看器是 CodeMirror 6 编辑器实例（而非原生 textarea）：行号、活动行底色、选区、括号匹配、历史与默认按键映射由编辑器提供，并按扩展名叠加语法高亮。每个打开的标签页各自保存一份草稿与一份磁盘基准文本，切换标签不会丢失未保存的修改（活动路径或只读保护变化时重建编辑器状态，否则同步文档）；实心圆点标记脏标签页。当活动标签页处于脏、保存中、保存失败或截断状态时，出现编辑器工具栏，显示状态与 VS 蓝色「保存」按钮（未变脏时禁用），快捷键为 Ctrl/Cmd+S（文件打开时会拦截，浏览器不会弹出另存为对话框）。截断的读取保持只读并显示警告——保存它会把截断内容覆盖回文件；标签页关闭时丢弃其编辑器状态。

### 语法高亮

CodeMirror 主题（`vs2019-theme.ts`）复现 VS2019 Dark 的编辑器外观与 token 配色，对齐 VS Code 随 `theme-defaults` 提供的官方主题文件（`dark_plus.json` + `dark_vs.json`）：注释 #6A9955、字符串 #CE9178、关键字 #569CD6、控制流关键字 #C586C0、数字 #B5CEA8、常量/枚举 #4FC1FF、函数 #DCDCAA、类型 #4EC9B0（含 C# `storage.type.cs`）、变量 #9CDCFE、运算符 #D4D4D4、`this`/`self` #569CD6、标签 #C8C8C8、无效 #F44747、Markdown 标题 #569CD6，选区 #264F78、行号 #858585，画布 #1E1E1E。C# 使用 legacy clike 解析器并外包一层，使声明匹配官方 scope：紧跟 `(` 的标识符（构造函数、方法声明或调用）着函数米黄色；`class`/`interface`/`record`/`struct` 后的名字为类型、`namespace` 后为命名空间、`var` 后为变量；`new`/`typeof`/`sizeof`/`default`/`nameof` 后的名字为类型。控制流关键字保持 VS2019 蓝色（clike 语法输出普通 `keyword` 而非 `keyword.control`）。语言按文件扩展名解析（`language.ts`）：TypeScript/JSX、JavaScript、Python、JSON、HTML、CSS、Markdown、YAML、C/C++、Java、Rust、PHP、SQL 与 Go，并通过 CodeMirror 的 legacy clike/xml mode 支持 C# 与 .NET XML 表面（.csproj/.config/.props/.targets/XAML）——C# 是本 fork .NET 工作区的主力语言；未知扩展名按纯文本渲染。CodeMirror 包作为普通依赖内联进 ui-explorer 客户端 bundle（无 worker、无外部资源）。

### VS2019 Dark 风格

fork 的主题默认值改为 `dark`（`ui-theme` 的 `DEFAULT_PREFERENCE`），整个工作台启动即进入内置深色调色板；该调色板的 alias 令牌重调为 VS2019 Dark 配色：窗口/编辑器 #1E1E1E、面板与侧边栏 #252526、抬升表面 #2D2D2D/#3C3C3C、文本 #DCDCDC（次级 #C8C8C8/#858585）、强调色 #007ACC、主按钮 #0E639C、诊断色 #F48771（错误）/ #4EC9B0（成功）/ #CCA700/#D7BA7D（警告）。外观设置仍可切换浅色与跟随系统。

查看器的 CSS 模块对编辑器本身同样使用 VS2019 Dark 调色板，并将 Consolas 置于编辑器字体栈首位，依次回退到 Cascadia Code 与系统等宽字体：编辑器背景 #1E1E1E、文本 #DCDCDC、选区 #264F78、行号 #858585、非活动标签 #2D2D2D（#252526 标签槽），活动标签顶部 #007ACC 强调色、按钮 #0E639C。行号栏与编辑器同底色，带细右边框，贴合 VS 编辑器的外观。

## Alternatives considered

**通过对话让智能体改文件。** 编辑会绕经一轮模型调用，比就地修改一行更慢、更间接；用户要求的是直接编辑打开的文件。

**复用已有写入路径。** 设置 seam 与面向智能体的 fs 工具服务于不同主体（配置、模型循环），且不是浏览器 RPC；fs 域是工作台文件文本 I/O 的天然归属。

**只保存活动标签的单一草稿，而非每个标签一份。** 切换标签会丢弃未保存的修改；按标签保存草稿以少量本地状态换取修改不丢失。

**允许保存截断内容。** 写回截断内容会静默破坏数据；截断标签保持只读是保守的默认行为。

**改用 Monaco Editor 而非 CodeMirror。** Monaco 是 VS Code 编辑器内核，其 `vs-dark` 主题使用同一调色板，但依赖更大，worker/AMD 加载方式与闭包工厂式插件 bundle 不兼容；CodeMirror 6 是纯 ESM、无需 worker，并以小得多的体积渲染同样的 VS2019 token 配色。用户要的是 VS2019 Dark 外观而非 VS Code 的功能面，故选择 CodeMirror。

**在 textarea 上叠加只读高亮层。** 高亮覆盖层配不可见可编辑 textarea（经典轻量技巧）会破坏选区、滚动与无障碍；真正的编辑器内核免除了这些 hack。

## Consequences

- GUI 现在可以直接修改项目文件，绕过智能体循环；写入路径与读取路径一样有边界与校验，且文件打开时浏览器的另存为对话框不再劫持 Ctrl+S。
- 整个工作台现在呈现 VS2019 Dark 外观：fork 默认深色调色板并带 VS 化令牌，编辑器、侧边栏与聊天区呈现统一主题，而非浅色外壳上悬浮一块深色编辑区。
- 未保存的修改在会话内切换标签时保留，关闭标签时丢弃，与朴素关闭动作一致。

## Testing

FileViewer 组件测试通过 `EditorView.findFromDOM` 驱动 CodeMirror 实例，覆盖：加载 → 编辑 → 脏标记 → 通过按钮保存、Ctrl+S 保存、切换标签后各标签草稿保留，以及截断读取的只读保护。宿主 apiproxy 的 fetch-carrier 与 client-handler 套件中的 fake 增加了 `fs.write` 行，离线 fixture 同步实现了写入动词。ui-theme 套件已按 fork 的新深色默认更新，并覆盖 VS 化令牌阶梯；浏览器级检查确认启动后的工作台（body、侧边栏、聊天区、编辑器）呈现 VS2019 Dark 调色板，且 TypeScript 文件渲染出预期的 token 配色（关键字 #569CD6、字符串 #CE9178、注释 #6A9955、类型 #4EC9B0）。