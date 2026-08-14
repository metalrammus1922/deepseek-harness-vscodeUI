# Agent Note: Git Repository Scan and Fork Data-Root Isolation

Status: implemented

English | [中文](2026-08-14-git-repo-scan-and-fork-data-root.zh.md)

## Problem

The fork's Git panel inspected a single repository (the session workspace root), but the user's workspace (`D:\workspace\SDSS_2025`) contains dozens of git repositories and hundreds of subprojects — one status call never shows the full set of uncommitted files. Separately, the fork's claimed data isolation was leaking: a shell that exports `DSH_HOME` (the stock install's `~/.dsh`) overrides the fork default `~/.dsh-vscodeui`, so a fork instance launched from such a shell wrote its workspace and sessions into the stock data root and overwrote the stock install's workspace list.

## Decision

### git.scan over the wire

The apiproxy git domain gains `git.scan` with an optional `root` payload. The host walks the tree (skipping node_modules/bin/obj/dist and friends, bounded at 8 levels and 500 repos), and every directory containing `.git` is reported as one flat row — never descended into — with its branch and uncommitted files (the same porcelain rows as `git.status`, two git invocations per repo). The Git panel now renders this multi-repo view: the header shows the repo and uncommitted-file totals, each repository row shows name, branch, and its uncommitted count, and expanding a row lists the files. Read-only, like the rest of the panel.

### Fork data-root isolation

The `dsh` CLI entry (`apps/cli/src/bin.ts`) pins `process.env.DSH_HOME` to the fork's own home (`~/.dsh-vscodeui`) before any profile boot resolves the harness home, so sessions, settings, storages, and workspaces can never leak into or from the stock install regardless of what the launching shell exported. This closes the leak that let a fork-launched instance write its `SDSS_2025` workspace into the stock `~/.dsh` registry.

## Alternatives considered

**Scan client-side by walking `fs.list`.** The browser would have to recurse the tree through one RPC per directory and could not honor the same skip/depth bounds efficiently; the host owns the walk and the git subprocesses.

**One git.status per repository from the UI.** The panel would not know the repository set without a scan anyway, and N round-trips beat one bounded host walk.

**Fix isolation only in launch instructions.** A documented `DSH_HOME=~/.dsh-vscodeui` export still leaks from shells that already exported the stock value; pinning the environment at the CLI entry makes the fork's data root unconditional.

## Consequences

- The Git panel shows every repository under the workspace root with its uncommitted files and totals — the VSCode-SCM style listing the user asked for, with no commit/stage actions.
- The fork's data root is now unconditional: no shell environment can route fork sessions or workspaces into the stock install, and the stock root's polluted workspace registry was cleaned (backup at `~/.dsh-pollution-backup-20260814`).

## Testing

End-to-end `git.scan` verified against `D:\workspace\SDSS_2025`: 32 repositories discovered, 14 uncommitted files, per-repo branch and counts; the browser Git panel renders the flat list. Host fakes in fetch-carrier/client-handler and the client fake-apis and fixture gained the `git.scan` row; the FileViewer spec's injected stub grew the new verb; the client aggregate typechecks.