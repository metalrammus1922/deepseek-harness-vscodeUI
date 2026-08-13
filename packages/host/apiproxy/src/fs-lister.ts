/**
 * Read-only filesystem listing helper for the apiproxy fs domain: one
 * directory level with files and subdirectories, directories first, each
 * name-sorted, bounded. Never follows symlinks (a link could escape the
 * workspace or loop).
 * @module @deepseek-ai/dsh-host-apiproxy
 */

import { readdir } from 'node:fs/promises'
import { join, posix, resolve, win32 } from 'node:path'
import type { FsEntry, FsListing } from './api/fs.ts'

/** Complete-result bound of one listing level. */
const MAX_ENTRIES = 5000

/**
 * True when the path names one fixed filesystem location regardless of
 * process state (drive-qualified on Windows, POSIX-absolute elsewhere).
 */
export function fsFullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\/]|[\/]{2}[^\/]+[\/]+[^\/]+)/.test(path)
    : posix.isAbsolute(path)
}

/**
 * List one directory level.
 * @param path - absolute directory to list; absent lists the process cwd.
 * @returns the level with bounded, sorted entries.
 */
export async function listFsDirectory(path?: string): Promise<FsListing> {
  if (path !== undefined && !fsFullyQualified(path)) {
    throw new Error(`cannot list "${path}": not a fully qualified path`)
  }
  const target = resolve(path ?? process.cwd())
  const dirents = await readdir(target, { withFileTypes: true })
  const entries: FsEntry[] = []
  for (const dirent of dirents) {
    // Symlinks skipped: entering one could loop or escape the workspace.
    if (dirent.isSymbolicLink()) continue
    entries.push({
      name: dirent.name,
      path: join(target, dirent.name),
      isDirectory: dirent.isDirectory(),
      hidden: dirent.name.startsWith('.'),
    })
  }
  entries.sort((a, b) => (
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1
  ))
  const truncated = entries.length > MAX_ENTRIES
  return { path: target, entries: truncated ? entries.slice(0, MAX_ENTRIES) : entries, truncated }
}
