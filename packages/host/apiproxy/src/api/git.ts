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

/** One discovered git repository: its top level plus uncommitted files. */
export interface GitScannedRepo {
  /** Absolute path of the repository top level (the directory containing `.git`). */
  path: string
  /** Display name (basename of the repository top level). */
  name: string
  /** Current branch name, or null on a detached HEAD. */
  branch: string | null
  /** Uncommitted rows (staged + unstaged + untracked), porcelain order. */
  files: GitStatusEntry[]
}

/** git.scan response value: repositories found under the scanned root. */
export interface GitScan {
  /** Absolute path that was scanned. */
  root: string
  /** Discovered repositories, one level flat (never nested inside another repo). */
  repos: GitScannedRepo[]
  /** True when the scan hit its repository-count bound. */
  truncated: boolean
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
  /**
   * Walk one directory tree and report every git repository found under it
   * (one level flat: a repository is never descended into), each with its
   * uncommitted files and their count. Read-only; noise directories
   * (node_modules/bin/obj/…) are skipped and the walk is depth- and
   * count-bounded.
   */
  scan(
    request: RpcRequest<{ root?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitScan>>
}
