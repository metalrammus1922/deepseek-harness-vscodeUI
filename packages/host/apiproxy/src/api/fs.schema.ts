/**
 * fs domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { FsEntry } from './fs.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** fs.list request payload; an absent path lists the host working directory. */
export const fsListRequestSchema = z.object({
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'fs.list'>>>

/** fs.read request payload. */
export const fsReadRequestSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'fs.read'>>>

/** fs.write request payload. */
export const fsWriteRequestSchema = z.object({
  path: z.string(),
  content: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'fs.write'>>>

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

/** fs.read response value. */
export const fsFileValueSchema = z.object({
  path: z.string(),
  content: z.string(),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'fs.read'>>>

/** fs.write response value. */
export const fsWriteValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'fs.write'>>>
