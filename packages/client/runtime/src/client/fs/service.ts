/** FsRuntime projects the Host fs domain for UI consumers (read-only listing). */

import type { Context } from '@deepseek-ai/cordis'
import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import type { IFs } from '../contract/fs.ts'

/** Structured failure so the file tree can surface Host business errors. */
export class FsError extends Error {
  constructor(readonly rpcError: { code: string; message: string }) {
    super(`fs list failed: ${rpcError.code}: ${rpcError.message}`)
    this.name = 'FsError'
  }
}

/** Real fs object layer and Host actions. */
export class FsRuntime implements IFs {
  /**
   * @param ctx - client root context.
   * @param api - shared wire client.
   */
  constructor(ctx: Context, private readonly api: IApiClient) {
    ctx.reflect.provide('fs', this, undefined)
  }

  async list(path?: string, signal?: AbortSignal) {
    const response = await this.api.fs.list(path === undefined ? {} : { path }, signal)
    if (!response.result.ok) throw new FsError(response.result.error)
    return response.result.value
  }
}
