/**
 * git domain contract. Read-only repository inspection for the browser's
 * source-control surface: status, current branch, and ahead/behind counts.
 * No protocol version: client and host ship together; introduce a version
 * only when an independently released client appears.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One changed path in `git status` porcelain terms. */
export interface GitStatusEntry {
  /** Repo-relative path (a directory path when the change is a collapsed untracked directory). */
  path: string
  /** Index status letter (' ' when clean) — porcelain XY column 1. */
  x: string
  /** Worktree status letter (' ' when clean) — porcelain XY column 2. */
  y: string
  /** True when the change is staged in the index. */
  staged: boolean
  /** True when the path is untracked (porcelain '??'). */
  untracked: boolean
  /** True when the row is a collapsed untracked directory. */
  directory: boolean
}

/** git.status response value: repo facts plus the changed-path rows. */
export interface GitStatus {
  /** False when the cwd is not inside a git work tree (or git is unavailable); entries is then empty. */
  isRepo: boolean
  /** Repository top-level absolute path (git rev-parse --show-toplevel), when a repo. */
  root: string | null
  /** Current branch name, or a short commit id when HEAD is detached. */
  branch: string | null
  /** Changed paths, porcelain order. */
  entries: GitStatusEntry[]
  /** Commits the local branch is ahead of its upstream. */
  ahead: number
  /** Commits the local branch is behind its upstream. */
  behind: number
  /** When the check itself failed (not a repo = isRepo false, no error). */
  error?: string
}

/** Git-domain unary methods. */
export interface GitApi {
  /**
   * One-shot working-tree status snapshot for the directory at `cwd`
   * (defaults to the host process working directory). Read-only: never
   * mutates the repository. A path outside any git work tree answers
   * isRepo: false instead of failing.
   */
  status(
    request: RpcRequest<{ cwd?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitStatus>>
}
