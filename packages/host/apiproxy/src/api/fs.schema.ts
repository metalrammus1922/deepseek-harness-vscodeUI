/**
 * fs domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { FsEntry, FsListing } from './fs.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** fs.list request payload; an absent path lists the host working directory. */
export const fsListRequestSchema = z.object({
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'fs.list'>>>

/** One directory-level row. */
export const fsEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  isDirectory: z.boolean(),
  hidden: z.boolean(),
}) satisfies z.ZodType<Wire<FsEntry>>

/** fs.list response value. */
export const fsListValueSchema = z.object({
  path: z.string(),
  entries: z.array(fsEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'fs.list'>>>
