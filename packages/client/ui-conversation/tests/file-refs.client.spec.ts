// @vitest-environment jsdom
// ConversationController file-reference chip semantics (VSCode style): the
// leading global chip tracks the viewer and can be pinned; manual chips are
// identified by path + line range, coexist with the global chip, and are
// removed only by identity.
import { makeTranslate, SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { describe, expect, it, vi } from 'vitest'
import { ComposerBlockRegistry } from '../src/client/input/blocks.ts'
import { InputHub } from '../src/client/input/hub.ts'
import { ConversationController } from '../src/client/service.ts'
import { zh } from '../src/client/locales.ts'

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const prompt = vi.fn(() => Promise.resolve({ ok: true as const, value: { accepted: true as const } }))
  const updateQueue = vi.fn(() => Promise.resolve({ ok: true as const, value: { accepted: true as const } }))
  const cancel = vi.fn(() => Promise.resolve({ ok: true as const, value: { accepted: true as const } }))
  const loadOlder = vi.fn(() => Promise.resolve())
  await runtime.sessions.add({
    id: 's1',
    session: { prompt, updateQueue, cancel, loadOlder },
  })
  const hub = new InputHub(runtime.ctx, makeTranslate(zh, {}))
  const fiber = runtime.ctx.plugin(ConversationController, {
    input: hub,
    blocks: new ComposerBlockRegistry(),
  })
  await fiber.await()
  const root = runtime.ctx.get('conversation') as ConversationController
  const scoped = runtime.sessions.scope('s1')!.get('conversation') as ConversationController
  const session = runtime.sessions.binding('s1')!.session
  return { runtime, root, scoped, session, prompt }
}

describe('ConversationController file-reference chips', () => {
  it('tracks the active viewer file as the leading whole-file global chip, replacing it on tab switches', async () => {
    const b = await bench()
    // The global chip references the complete file: the selection lines the
    // viewer reports are dropped (they live only on manual chips).
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/a.ts', name: 'a.ts', lines: null, global: true },
    ])
    b.root.setActiveFile({ path: '/w/b.ts', name: 'b.ts', lines: null })
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/b.ts', name: 'b.ts', lines: null, global: true },
    ])
    await b.runtime.dispose()
  })

  it('keeps a pinned global chip across tab switches and resumes tracking on unpin', async () => {
    const b = await bench()
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    b.root.setActiveFilePinned(true)
    b.root.setActiveFile({ path: '/w/b.ts', name: 'b.ts', lines: null })
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/a.ts', name: 'a.ts', lines: null, global: true, pinned: true },
    ])
    // Unpinning snaps the global chip back to the current viewer file.
    b.root.setActiveFilePinned(false)
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/b.ts', name: 'b.ts', lines: null, global: true },
    ])
    await b.runtime.dispose()
  })

  it('keeps a manual chip alongside a global chip of the same path: they are different chips', async () => {
    const b = await bench()
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    const refs = b.root.fileRefs.getSnapshot()
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ path: '/w/a.ts', global: true })
    expect(refs[1]).toEqual({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    await b.runtime.dispose()
  })

  it('treats different line ranges as different chips and dedupes identical ones', async () => {
    const b = await bench()
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 20, end: 30 } })
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } },
      { path: '/w/a.ts', name: 'a.ts', lines: { start: 20, end: 30 } },
    ])
    await b.runtime.dispose()
  })

  it('removes a manual chip by path + line range without touching the global chip or other lines', async () => {
    const b = await bench()
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: null })
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    b.root.addFileRef({ path: '/w/a.ts', name: 'a.ts', lines: { start: 20, end: 30 } })
    b.root.removeFileRef({ path: '/w/a.ts', lines: { start: 1, end: 10 } })
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/a.ts', name: 'a.ts', lines: null, global: true },
      { path: '/w/a.ts', name: 'a.ts', lines: { start: 20, end: 30 } },
    ])
    await b.runtime.dispose()
  })

  it('drops the unpinned global chip when no tab is open but keeps manual chips', async () => {
    const b = await bench()
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: null })
    b.root.addFileRef({ path: '/w/b.ts', name: 'b.ts', lines: { start: 1, end: 2 } })
    b.root.setActiveFile(null)
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/b.ts', name: 'b.ts', lines: { start: 1, end: 2 } },
    ])
    await b.runtime.dispose()
  })

  it('clears manual chips after a successful send but keeps the global chip', async () => {
    const b = await bench()
    b.root.setActiveFile({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 10 } })
    b.root.addFileRef({ path: '/w/b.ts', name: 'b.ts', lines: { start: 1, end: 10 } })
    await b.scoped.sendSession(b.session, 'hello', [], 'queue')
    expect(b.prompt).toHaveBeenCalledOnce()
    // VSCode clears the composer references after sending; the global chip
    // stays because it tracks the viewer's active file.
    expect(b.root.fileRefs.getSnapshot()).toEqual([
      { path: '/w/a.ts', name: 'a.ts', lines: null, global: true },
    ])
    await b.runtime.dispose()
  })
})
