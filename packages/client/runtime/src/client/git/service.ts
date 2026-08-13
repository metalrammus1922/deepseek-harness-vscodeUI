/** GitRuntime projects the Host git domain for UI consumers (read-only status). */

import type { Context } from '@deepseek-ai/cordis'
import type { IApiClient, GitStatus } from '@deepseek-ai/dsh-api-remotes/client'
import type { IGit } from '../contract/git.ts'

/** Structured failure so the source-control surface can surface Host business errors. */
export class GitError extends Error {
  constructor(readonly rpcError: { code: string; message: string }) {
    super(`git status failed: ${rpcError.code}: ${rpcError.message}`)
    this.name = 'GitError'
  }
}

/** Real git object layer and Host actions. */
export class GitRuntime implements IGit {
  /**
   * @param ctx - client root context.
   * @param api - shared wire client.
   */
  constructor(ctx: Context, private readonly api: IApiClient) {
    ctx.reflect.provide('git', this, undefined)
  }

  async status(cwd?: string, signal?: AbortSignal): Promise<GitStatus> {
    const response = await this.api.git.status(cwd === undefined ? {} : { cwd }, signal)
    if (!response.result.ok) throw new GitError(response.result.error)
    return response.result.value
  }
}
