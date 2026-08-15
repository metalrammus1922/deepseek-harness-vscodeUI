// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
// Type-only: pull the plugin's LocaleNamespaceMap merge ('explorer') into this program.
import type {} from '../src/client/index.ts'
import type { FileViewerProps } from '../src/client/contract/slots.ts'
import { createExplorerStore } from '../src/client/store.ts'
import { FileViewer } from '../src/client/FileViewer.tsx'
import { EXPLORER_STORAGE_KEY } from '../src/client/persistence.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
// The viewer persists its tabs/content in localStorage; isolated per test.
// jsdom has no layout: the CodeMirror line-reveal effect calls scrollIntoView.
beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = () => {}
})

const t: FileViewerProps['t'] = makeTranslate(zh, commonZh)

/** jsdom-safe framework-hook stub: a selector over a fixed snapshot (no subscription). */
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

function mount(overrides: Partial<FileViewerProps> = {}) {
  const store = createExplorerStore().create()
  const fsList = vi.fn(async (path: string) => ({ path, entries: [], truncated: false }))
  const fsRead = vi.fn(async (path: string) => ({ path, content: 'line one\nline two\n', truncated: false }))
  const fsWrite = vi.fn(async (path: string) => ({ path }))
  const gitStatus = vi.fn(async () => ({ isRepo: false, root: null, branch: null, entries: [], ahead: 0, behind: 0 }))
  const gitScan = vi.fn(async (root: string) => ({ root, repos: [], truncated: false }))
  const props: FileViewerProps = {
    useStore: bindSnapshotSelector(store),
    useSessions: hook({ current: undefined }) as unknown as FileViewerProps['useSessions'],
    useWorkspaces: hook({ items: [{ path: '/w' }] }) as unknown as FileViewerProps['useWorkspaces'],
    actions: store.actions,
    fsList,
    fsRead,
    fsWrite,
    gitStatus,
    gitScan,
    addFileRef: vi.fn(),
    onActiveFile: vi.fn(),
    usePendingOpen: hook(null) as unknown as FileViewerProps['usePendingOpen'],
    t,
    ...overrides,
  }
  const view = render(<FileViewer {...props} />)
  return { view, props, store, fsRead, fsWrite }
}

function cmContent(container: HTMLElement): HTMLElement {
  const content = container.querySelector('.cm-content')
  if (content === null) throw new Error('CodeMirror .cm-content not rendered')
  return content as HTMLElement
}

function cmView(container: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(cmContent(container))
  if (view === null) throw new Error('no EditorView instance behind .cm-content')
  return view
}

async function open(m: ReturnType<typeof mount>, path: string, name: string) {
  m.store.actions.openFile({ path, name })
  await waitFor(() => {
    expect(m.view.container.querySelector('.cm-content')).not.toBeNull()
  })
  return cmView(m.view.container)
}

describe('FileViewer', () => {
  it('loads a file into CodeMirror, edits it, marks the tab dirty, and saves through fsWrite', async () => {
    const m = mount()
    const view = await open(m, '/w/a.ts', 'a.ts')
    expect(view.state.doc.toString()).toBe('line one\nline two\n')
    expect(m.fsWrite).not.toHaveBeenCalled()

    // User edit through the CodeMirror API mirrors a real keystroke.
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'line one\nCHANGED\n' } })
    // Dirty state surfaces on the tab and in the editor bar.
    expect(screen.getByText('a.ts')).toBeTruthy()
    await waitFor(() => expect(screen.getByTitle('有未保存的更改')).toBeTruthy())
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(m.fsWrite).toHaveBeenCalledWith('/w/a.ts', 'line one\nCHANGED\n'))
    // A saved tab turns clean: the dirty dot and the save button disappear.
    await waitFor(() => expect(screen.queryByRole('button', { name: '保存' })).toBeNull())
    expect(screen.queryByTitle('有未保存的更改')).toBeNull()
  })

  it('saves with Ctrl+S and keeps per-tab drafts when switching tabs', async () => {
    const m = mount()
    const first = await open(m, '/w/a.ts', 'a.ts')
    first.dispatch({ changes: { from: 0, to: first.state.doc.length, insert: 'edited A' } })

    m.store.actions.openFile({ path: '/w/b.ts', name: 'b.ts' })
    await waitFor(() => expect(cmView(m.view.container).state.doc.toString()).toBe('line one\nline two\n'))
    const second = cmView(m.view.container)
    second.dispatch({ changes: { from: 0, to: second.state.doc.length, insert: 'edited B' } })

    // Back to the first tab: its unsaved draft is still there.
    m.store.actions.activateFile('/w/a.ts')
    await waitFor(() => expect(cmView(m.view.container).state.doc.toString()).toBe('edited A'))

    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await waitFor(() => expect(m.fsWrite).toHaveBeenCalledWith('/w/a.ts', 'edited A'))
  })

  it('keeps a truncated read read-only without a save path', async () => {
    const m = mount({
      fsRead: vi.fn(async (path: string) => ({ path, content: 'cut', truncated: true })),
    })
    await open(m, '/w/big.ts', 'big.ts')
    expect(cmView(m.view.container).state.facet(EditorState.readOnly)).toBe(true)
    expect(screen.getByText('文件过大，已截断显示，无法编辑和保存')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('“添加到对话” references the selected lines as a chip, not as draft text', async () => {
    const m = mount()
    const view = await open(m, '/w/a.ts', 'a.ts')
    expect(m.props.addFileRef).not.toHaveBeenCalled()

    // Select lines 1-2; the selection bar offers the add-to-chat action.
    view.dispatch({ selection: { anchor: 0, head: 'line one\nline two'.length } })
    await waitFor(() => expect(screen.getByRole('button', { name: '添加到对话' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }))

    // The action adds a file reference chip (path + line range) and never
    // pastes filename/line numbers or source text into the composer.
    expect(m.props.addFileRef).toHaveBeenCalledTimes(1)
    expect(m.props.addFileRef).toHaveBeenCalledWith({ path: '/w/a.ts', name: 'a.ts', lines: { start: 1, end: 2 } })
    // The selection stays so the chip keeps its line range.
    expect(screen.getByRole('button', { name: '添加到对话' })).toBeTruthy()
  })

  it('restores opened tabs and cached content after a page refresh', async () => {
    localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({
      root: '/w',
      tabs: [{ path: '/w/a.ts', name: 'a.ts' }, { path: '/w/b.ts', name: 'b.ts' }],
      activePath: '/w/a.ts',
      files: {
        '/w/a.ts': { saved: 'line one\nline two\n', draft: 'line one\nline two\n', truncated: false },
      },
    }))
    const m = mount()
    // The store is seeded from the persisted payload: both tabs open, the
    // active one active.
    await waitFor(() => {
      expect(m.store.getSnapshot().tabs.map(tab => tab.path)).toEqual(['/w/a.ts', '/w/b.ts'])
      expect(m.store.getSnapshot().activePath).toBe('/w/a.ts')
    })
    // The restored active tab renders from the cached content without a
    // disk read, and the payload is written back for the next reload.
    expect(m.fsRead).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(cmView(m.view.container).state.doc.toString()).toBe('line one\nline two\n')
    })
    expect(localStorage.getItem(EXPLORER_STORAGE_KEY)).toContain('/w/a.ts')
  })

  it('skips the restore when the persisted root is a different workspace', async () => {
    localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({
      root: '/other',
      tabs: [{ path: '/other/x.cs', name: 'x.cs' }],
      activePath: '/other/x.cs',
      files: {},
    }))
    const m = mount()
    await waitFor(() => {
      expect(m.store.getSnapshot().tabs).toEqual([])
    })
    expect(screen.getByText('在左侧文件树中点击一个文件以查看其内容')).toBeTruthy()
  })

  it('jumps to the chip line range when an open request arrives', async () => {
    const pendingOpen = createSnapshotStore<{ path: string; lines: { start: number; end: number } | null; seq: number } | null>(null)
    const m = mount({ usePendingOpen: bindSnapshotSelector(pendingOpen) as never })
    const view = await open(m, '/w/a.ts', 'a.ts')
    // The editor holds 'line one\nline two\n'; a chip open of line 2 selects
    // that line and scrolls it into view.
    pendingOpen.set({ path: '/w/a.ts', lines: { start: 2, end: 2 }, seq: 1 })
    await waitFor(() => {
      const sel = view.state.selection.main
      expect(view.state.doc.lineAt(sel.from).number).toBe(2)
      expect(sel.to > sel.from).toBe(true)
    })
  })
})
