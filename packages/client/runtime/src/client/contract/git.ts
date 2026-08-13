/**
 * The outward git-service face — what `ctx.git` exposes to feature packages,
 * and therefore exactly what the test runtime's git double must implement.
 * The concrete class owns the wire calls; widening this interface is the
 * explicit act of widening what features may do to the git domain.
 */
import type { GitStatus } from '@deepseek-ai/dsh-api-remotes/client'

/** The git-service face injected as `ctx.git`. */
export interface IGit {
  /**
   * One-shot working-tree status snapshot for `cwd` (absent: the host
   * process working directory). Read-only on the host side.
   * @param cwd - absolute directory to inspect.
   * @param signal - aborts the wire request.
   * @returns repo facts and changed paths; isRepo: false outside a work tree.
   */
  status(cwd?: string, signal?: AbortSignal): Promise<GitStatus>
}
