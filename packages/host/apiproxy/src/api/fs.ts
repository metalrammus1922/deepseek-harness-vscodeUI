/**
 * fs domain contract. Read-only directory listing for the browser's file
 * tree: files AND subdirectories in one level, name-sorted directories
 * first. Unlike the directory-picker browse capability (which lists only
 * enterable directories), this domain is the file explorer's data source.
 * No protocol version: client and host ship together.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One row of a directory level. */
export interface FsEntry {
  /** Base name within the listed directory. */
  name: string
  /** Absolute host path (the client never joins path segments itself). */
  path: string
  /** True for a subdirectory (the client may expand it). */
  isDirectory: boolean
  /** Hidden by the platform convention (dot-prefixed on POSIX). */
  hidden: boolean
}

/** fs.list response value: one directory level. */
export interface FsListing {
  /** Absolute path of the listed directory. */
  path: string
  /** Direct children, directories first then files, each name-sorted. */
  entries: FsEntry[]
  /** True when the level was cut at its complete-result bound. */
  truncated: boolean
}

/** Fs-domain unary methods. */
export interface FsApi {
  /**
   * List one directory level; an absent path lists the host process working
   * directory. Read-only. Unreadable or missing targets fail with
   * `fs-list-unreadable`.
   */
  list(
    request: RpcRequest<{ path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<FsListing>>
}
