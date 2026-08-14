# Agent Note: Git Repository Scan and Fork Data-Root Isolation

Status: implemented

[English](2026-08-14-git-repo-scan-and-fork-data-root.md) | 中文

## Problem

fork 的 Git 面板只检查单个仓库（会话工作区根目录），但用户的工作区（`D:\workspace\SDSS_2025`）包含几十个 git 仓库与数百个子项目——一次状态调用永远看不到完整的未提交文件集合。另外，fork 宣称的数据隔离在泄漏：如果启动 shell 导出了 `DSH_HOME`（标准版安装的 `~/.dsh`），它会覆盖 fork 默认的 `~/.dsh-vscodeui`，于是从该 shell 启动的 fork 实例会把工作区与会话写入标准版数据根，并覆盖标准版的工作区列表。

## Decision

### 增加 git.scan 远程调用

apiproxy git 域新增 `git.scan`，可选 `root` 负载。宿主遍历目录树（跳过 node_modules/bin/obj/dist 等，限制 8 层与 500 个仓库），每个含 `.git` 的目录作为一条平铺行上报——绝不下探——并携带其分支与未提交文件（与 `git.status` 相同的 porcelain 行，每仓库两次 git 调用）。Git 面板现在渲染多仓库视图：标题显示仓库数与未提交文件总数，每个仓库行显示名称、分支与未提交数，展开后列出文件。与面板其余部分一样只读。

### fork 数据根隔离

`dsh` CLI 入口（`apps/cli/src/bin.ts`）在任意 profile boot 解析 harness home 之前，把 `process.env.DSH_HOME` 钉到 fork 自己的 home（`~/.dsh-vscodeui`），因此无论启动 shell 导出了什么，会话、设置、存储与工作区都不会与标准版安装互渗。这堵住了泄漏：此前 fork 启动的实例把它的 `SDSS_2025` 工作区写进了标准版 `~/.dsh` 注册表。

## Alternatives considered

**客户端通过 `fs.list` 遍历扫描。** 浏览器必须通过每个目录一次 RPC 递归整棵树，且无法高效遵守同样的跳过/深度约束；宿主拥有遍历与 git 子进程。

**UI 里对每个仓库各调一次 git.status。** 面板本来就需要扫描才知道仓库集合，而且一次有界的宿主遍历优于 N 次往返。

**仅在启动说明里修复隔离。** 文档化的 `DSH_HOME=~/.dsh-vscodeui` 导出仍会从已导出标准版值的 shell 泄漏；在 CLI 入口钉住环境使 fork 数据根无条件生效。

## Consequences

- Git 面板显示工作区根下的每个仓库及其未提交文件与总数——用户要求的 VSCode-SCM 风格平铺列表，无提交/暂存操作。
- fork 数据根现在无条件生效：任何 shell 环境都无法把 fork 会话或工作区导向标准版安装，标准版根中被污染的 workspace 注册表已清理（备份在 `~/.dsh-pollution-backup-20260814`）。

## Testing

对 `D:\workspace\SDSS_2025` 端到端验证 `git.scan`：发现 32 个仓库、14 个未提交文件、每仓库分支与计数；浏览器 Git 面板渲染平铺列表。fetch-carrier/client-handler 的宿主 fake 与客户端 fake-api、fixture 增加了 `git.scan` 行；FileViewer 规格的注入 stub 增加新动词；客户端聚合类型检查通过。