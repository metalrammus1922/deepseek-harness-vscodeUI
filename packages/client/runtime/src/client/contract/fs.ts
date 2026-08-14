/**
 * The outward fs-service face — what `ctx.fs` exposes to feature packages,
 * and therefore exactly what the test runtime's fs double must implement.
 * The concrete class owns the wire calls.
 */
import type { FsFile, FsListing, FsWriteResult } from '@deepseek-ai/dsh-api-remotes/client'

/** The fs-service face injected as `ctx.fs`. */
export interface IFs {
  /**
   * List one directory level (files and subdirectories); an absent path
   * lists the host process working directory. Read-only on the host side.
   * @param path - absolute directory to list.
   * @param signal - aborts the wire request.
   * @returns the level's children, directories first then files.
   */
  list(path?: string, signal?: AbortSignal): Promise<FsListing>
  /**
   * Read one file's text content (UTF-8). Read-only on the host side; a
   * directory or unreadable target rejects with FsError.
   * @param path - absolute file path.
   * @param signal - aborts the wire request.
   * @returns the file content, truncated at the host read bound.
   */
  read(path: string, signal?: AbortSignal): Promise<FsFile>
  /**
   * Write one file's text content (UTF-8), creating or replacing the target.
   * A non-fully-qualified path, a directory, or an unwritable target rejects
   * with FsError; content over the host write bound is refused, not cut.
   * @param path - absolute file path.
   * @param content - new file content.
   * @param signal - aborts the wire request.
   * @returns the written file's absolute path.
   */
  write(path: string, content: string, signal?: AbortSignal): Promise<FsWriteResult>
}
