// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
// Type-only: pull the plugin's LocaleNamespaceMap merge ('explorer') into this program.
import type {} from '../src/client/index.ts'
import type { FileViewerProps } from '../src/client/contract/slots.ts'
import { createExplorerStore } from '../src/client/store.ts'
import { FileViewer } from '../src/client/FileViewer.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

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
  const props: FileViewerProps = {
    useStore: bindSnapshotSelector(store),
    useSessions: hook({} as never) as never,
    useWorkspaces: hook({} as never) as never,
    actions: store.actions,
    fsList,
    fsRead,
    fsWrite,
    gitStatus,
    addToChat: vi.fn(),
    onActiveFile: vi.fn(),
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
})
