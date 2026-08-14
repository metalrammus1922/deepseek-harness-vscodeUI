/**
 * Read-only filesystem listing helper for the apiproxy fs domain: one
 * directory level with files and subdirectories, directories first, each
 * name-sorted, bounded. Never follows symlinks (a link could escape the
 * workspace or loop).
 * @module @deepseek-ai/dsh-host-apiproxy
 */

import { open, readdir, stat } from 'node:fs/promises'
import { join, posix, resolve, win32 } from 'node:path'
import type { FsEntry, FsFile, FsListing } from './api/fs.ts'

/** Complete-result bound of one listing level. */
const MAX_ENTRIES = 5000
/** Complete-result bound of one file read (one byte past the cut). */
const MAX_FILE_BYTES = 1024 * 1024

/**
 * True when the path names one fixed filesystem location regardless of
 * process state (drive-qualified on Windows, POSIX-absolute elsewhere).
 * Windows drive and separator runs accept both slashes; a literal
 * backslash in a regex class is [\\] (a class [\/] is only a forward
 * slash, which would reject every native Windows path).
 */
export function fsFullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
    ? win32.isAbsolute(path) && /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/]+[^\\/]+)/.test(path)
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

/**
 * Read one file's text content (UTF-8), bounded. Directories, symlinks, and
 * unreadable targets throw; a file larger than the bound is cut and flagged.
 * @param path - absolute file path.
 * @returns the content with the bounded/truncated facts.
 */
export async function readFsFile(path: string): Promise<FsFile> {
  if (!fsFullyQualified(path)) {
    throw new Error(`cannot read "${path}": not a fully qualified path`)
  }
  const target = resolve(path)
  const info = await stat(target)
  if (!info.isFile()) {
    throw new Error(`cannot read "${target}": not a regular file`)
  }
  const handle = await open(target, 'r')
  try {
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, MAX_FILE_BYTES + 1, 0)
    const truncated = bytesRead > MAX_FILE_BYTES
    const content = buffer.subarray(0, Math.min(bytesRead, MAX_FILE_BYTES)).toString('utf8')
    return { path: target, content, truncated }
  } finally {
    await handle.close()
  }
}
