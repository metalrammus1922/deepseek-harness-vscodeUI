/**
 * git domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { GitScannedRepo, GitStatusEntry } from './git.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** git.status request payload; an absent cwd uses the host process working directory. */
export const gitStatusRequestSchema = z.object({
  cwd: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.status'>>>

/** One changed-path row of a git.status response. */
export const gitStatusEntrySchema = z.object({
  path: z.string(),
  x: z.string(),
  y: z.string(),
  staged: z.boolean(),
  untracked: z.boolean(),
  directory: z.boolean(),
}) satisfies z.ZodType<Wire<GitStatusEntry>>

/** git.status response value. */
export const gitStatusValueSchema = z.object({
  isRepo: z.boolean(),
  root: z.string().nullable(),
  branch: z.string().nullable(),
  entries: z.array(gitStatusEntrySchema),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  error: z.string().optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.status'>>>

/** git.scan request payload; an absent root uses the host process working directory. */
export const gitScanRequestSchema = z.object({
  root: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'git.scan'>>>

/** One repository row of a git.scan response. */
export const gitScannedRepoSchema = z.object({
  path: z.string(),
  name: z.string(),
  branch: z.string().nullable(),
  files: z.array(gitStatusEntrySchema),
}) satisfies z.ZodType<Wire<GitScannedRepo>>

/** git.scan response value. */
export const gitScanValueSchema = z.object({
  root: z.string(),
  repos: z.array(gitScannedRepoSchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'git.scan'>>>
