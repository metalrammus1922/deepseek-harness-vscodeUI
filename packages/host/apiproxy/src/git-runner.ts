/**
 * Read-only git subprocess runner for the apiproxy git domain. Every call
 * spawns a short-lived `git` process under the given working directory and
 * resolves with its exit code and captured output — never a throw, so the
 * wire boundary can decide failure shape. Aborts kill the child process.
 * @module @deepseek-ai/dsh-host-apiproxy
 */

import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { GitScannedRepo, GitStatus, GitStatusEntry } from './api/git.ts'

/** One finished git invocation. */
export interface GitCommandResult {
  /** Process exit code; 1 when the spawn itself failed (missing git, kill, timeout). */
  code: number | null
  /** Captured stdout (utf8). */
  stdout: string
  /** Captured stderr (utf8). */
  stderr: string
}

/** Per-invocation hard bound: a hung git must not pin a host request forever. */
const GIT_TIMEOUT_MS = 10_000
/** stdout/stderr cap for one invocation (a pathological status output must not balloon memory). */
const GIT_MAX_BUFFER = 4 * 1024 * 1024

/**
 * Run one `git` command in `cwd`.
 * @param cwd - working directory for the child (git -C).
 * @param args - git arguments, verbatim (no shell quoting — spawn form).
 * @param signal - caller lifetime; aborting kills the child.
 * @returns the result; spawn/timeout/kill failures report code 1.
 */
export function runGit(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitCommandResult> {
  return new Promise<GitCommandResult>((resolve) => {
    const child = execFile(
      'git',
      ['-C', cwd, ...args],
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, timeout: GIT_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stdout, stderr: stderr ?? '' })
          return
        }
        // ENOENT (no git on PATH), non-zero exit, timeout, or kill all land
        // here; only a numeric code carries the process's own exit status.
        resolve({
          code: typeof error.code === 'number' ? error.code : 1,
          stdout,
          stderr: stderr ?? '',
        })
      },
    )
    if (signal !== undefined) {
      if (signal.aborted) child.kill()
      else signal.addEventListener('abort', () => child.kill(), { once: true })
    }
  })
}

/**
 * Parse porcelain v1 NUL-separated status output into rows. In -z form every
 * entry is `XY <path>` followed by a NUL; a rename/copy emits the old path,
 * then the new path as the following chunk.
 * @param raw - `git status --porcelain=v1 -z` output ('' when clean).
 * @returns the changed-path rows.
 */
export function parsePorcelain(raw: string): GitStatusEntry[] {
  if (raw === '') return []
  const chunks = raw.split('\0')
  const entries: GitStatusEntry[] = []
  let i = 0
  while (i < chunks.length) {
    const chunk = chunks[i]
    if (chunk === undefined || chunk === '') {
      i += 1
      continue
    }
    const x = chunk[0] ?? ' '
    const y = chunk[1] ?? ' '
    let path = chunk.length > 3 ? chunk.slice(3) : ''
    if ((x === 'R' || x === 'C') && i + 1 < chunks.length) {
      const next = chunks[i + 1]
      if (next !== undefined && next !== '') path = next
      i += 2
    } else {
      i += 1
    }
    const untracked = x === '?' && y === '?'
    const directory = untracked && path.endsWith('/')
    if (directory) path = path.slice(0, -1)
    entries.push({
      path,
      x,
      y,
      staged: x !== ' ' && x !== '?' && x !== '!',
      untracked,
      directory,
    })
  }
  return entries
}

/**
 * One read-only status snapshot of the repository containing `cwd`.
 * @param cwd - directory to inspect (absolute host path).
 * @param signal - caller lifetime; aborting kills any in-flight git child.
 * @returns repo facts and changed paths; isRepo: false outside a work tree.
 */
export async function gitStatus(cwd: string, signal?: AbortSignal): Promise<GitStatus> {
  const topLevel = await runGit(cwd, ['rev-parse', '--show-toplevel'], signal)
  if (topLevel.code !== 0) {
    return { isRepo: false, root: null, branch: null, entries: [], ahead: 0, behind: 0 }
  }
  const root = topLevel.stdout.trim() || null
  const [branchRes, statusRes, countRes] = await Promise.all([
    runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], signal),
    runGit(cwd, ['status', '--porcelain=v1', '-z'], signal),
    runGit(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], signal),
  ])
  let branch = branchRes.code === 0 ? branchRes.stdout.trim() : null
  if (branch === 'HEAD') {
    // Detached HEAD: rev-parse names the literal 'HEAD'; show the short commit id instead.
    const short = await runGit(cwd, ['rev-parse', '--short', 'HEAD'], signal)
    branch = short.code === 0 ? short.stdout.trim() : null
  }
  if (branch === '') branch = null
  let ahead = 0
  let behind = 0
  if (countRes.code === 0) {
    const parts = countRes.stdout.trim().split(/\s+/)
    ahead = Number(parts[0] ?? 0)
    behind = Number(parts[1] ?? 0)
    if (!Number.isFinite(ahead)) ahead = 0
    if (!Number.isFinite(behind)) behind = 0
  }
  return { isRepo: true, root, branch, entries: parsePorcelain(statusRes.stdout), ahead, behind }
}

/**
 * Walk one directory tree and report every git repository under it (one
 * level flat: a repository top level is reported and never descended into, so
 * nested submodules and worktrees surface as separate flat rows). Noise
 * directories are skipped and the walk is depth- and count-bounded.
 * @param root - absolute directory to scan; an absent value scans the cwd.
 * @param signal - caller lifetime; aborting kills any in-flight git child.
 * @returns the discovered repositories (each with its uncommitted files).
 */
export async function scanGitRepos(
  root: string,
  signal?: AbortSignal,
): Promise<{ root: string; repos: GitScannedRepo[]; truncated: boolean }> {
  const repos: GitScannedRepo[] = []
  const MAX_DEPTH = 8
  const MAX_REPOS = 500
  // Build/output/third-party directories that never contain a project's own
  // repository (their .git would be a nested submodule reported elsewhere).
  const SKIP = new Set(['node_modules', 'bin', 'obj', '.vs', '.vscode', '.idea',
    'dist', 'out', 'build', '__pycache__', '.venv', 'venv', '.git'])

  /** One repository's branch + uncommitted rows (two git calls). */
  const repoStatus = async (dir: string): Promise<GitScannedRepo | null> => {
    const [branchRes, statusRes] = await Promise.all([
      runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'], signal),
      runGit(dir, ['status', '--porcelain=v1', '-z'], signal),
    ])
    // A porcelain status always exits 0; anything else means git is missing
    // or the directory stopped being a work tree — skip it.
    if (statusRes.code !== 0) return null
    let branch = branchRes.code === 0 ? branchRes.stdout.trim() : null
    if (branch === 'HEAD' || branch === '') branch = null
    return {
      path: dir,
      name: dir.split(/[\\/]/).filter(Boolean).pop() ?? dir,
      branch,
      files: parsePorcelain(statusRes.stdout),
    }
  }

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (repos.length >= MAX_REPOS || depth > MAX_DEPTH) return
    let dirents
    try {
      dirents = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable directory: nothing to report, keep walking siblings
    }
    if (dirents.some(e => e.name === '.git')) {
      const repo = await repoStatus(dir)
      if (repo !== null) repos.push(repo)
      return // flat: never descend into a repository
    }
    for (const dirent of dirents) {
      if (!dirent.isDirectory() || SKIP.has(dirent.name)) continue
      await walk(join(dir, dirent.name), depth + 1)
    }
  }

  await walk(root, 0)
  return { root, repos, truncated: repos.length >= MAX_REPOS }
}
