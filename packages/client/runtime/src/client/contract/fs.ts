/**
 * The outward fs-service face — what `ctx.fs` exposes to feature packages,
 * and therefore exactly what the test runtime's fs double must implement.
 * The concrete class owns the wire calls.
 */
import type { FsListing } from '@deepseek-ai/dsh-api-remotes/client'

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
}
