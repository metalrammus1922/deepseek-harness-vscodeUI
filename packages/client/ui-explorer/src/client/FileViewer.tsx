/**
 * Center file viewer (ui-layout's 'file-viewer' seat): the open file tabs
 * from the shared explorer store, with the active tab's text read through
 * ctx.fs.read. The editor is a read-only CodeMirror 6 instance themed as
 * VS2019 Dark with per-extension syntax highlighting; select code and press
 * "添加到对话" to add a `path:start-end` reference chip to the AI chat
 * composer (the model reads the file from the reference). External edits
 * (git, other editors) surface automatically through a 1s poll. Open tabs
 * and their cached content persist in localStorage, so a page refresh
 * brings them back. Root-scoped — no session needed to view files.
 */
import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import type { FileViewerProps } from './contract/slots.ts'
import { languageForPath } from './language.ts'
import { loadExplorerState, saveExplorerState } from './persistence.ts'
import { vs2019EditorExtensions } from './vs2019-theme.ts'
import css from './FileViewer.module.css'

type Phase = 'idle' | 'loading' | 'ready' | 'error'

/** External-change poll interval for the active file. */
const FILE_POLL_MS = 1000

/**
 * Render the open file tabs and the active file's content in a read-only
 * VS2019-Dark CodeMirror editor with line-based selection for referencing
 * code in the AI chat. External changes to the active file reload
 * automatically (no local edits can conflict). Cached tabs switch
 * instantly; truncated reads show a notice.
 * @param props - composed slot props (store share + injected verbs + copy).
 * @returns the viewer element tree.
 */
export function FileViewer({
  useStore, useWorkspaces, useSessions, usePendingOpen, actions, fsRead, addFileRef, onActiveFile, t,
}: FileViewerProps) {
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const active = tabs.find(tab => tab.path === activePath) ?? null

  // The workspace root the opened tabs belong to: persisted tabs restore
  // only under their own root, so a different workspace never resurfaces
  // another one's files.
  const workspaceItems = useWorkspaces(s => s.items)
  const sessionCwd = useSessions((s) => {
    const current = s.current
    return current !== undefined ? s.byId[current]?.cwd : undefined
  })
  const root = sessionCwd ?? workspaceItems[0]?.path

  // Report the active tab (and its current selection) as the chat's
  // preferred file context — on tab changes and on every selection change
  // so the composer chip keeps its line range live.
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  useEffect(() => {
    onActiveFile(active === null ? null : {
      path: active.path,
      name: active.name,
      lines: selection === null ? null : { start: selection.start, end: selection.end },
    })
  }, [active, selection, onActiveFile])

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  // Per-tab on-disk content and truncation flags.
  const [content, setContent] = useState<Record<string, string>>({})
  const [truncated, setTruncated] = useState<Record<string, boolean>>({})
  // Paths whose content is already cached in this session: switching back
  // to one renders instantly instead of re-reading the disk (the 1s poll
  // keeps the cached content fresh against external edits).
  const cachedPathsRef = useRef<Set<string>>(new Set())

  // Load the active file. A tab whose content is already cached switches
  // instantly (no disk re-read, no loading flash); a fresh tab reads once
  // and is added to the cache. The 1s poll keeps cached tabs fresh.
  useEffect(() => {
    if (active === null) {
      setPhase('idle')
      setError(null)
      return
    }
    if (cachedPathsRef.current.has(active.path)) {
      setPhase('ready')
      setError(null)
      return
    }
    const controller = new AbortController()
    setPhase('loading')
    setError(null)
    fsRead(active.path, controller.signal).then((file) => {
      if (controller.signal.aborted) return
      cachedPathsRef.current.add(active.path)
      setContent(prev => prev[active.path] === undefined ? { ...prev, [active.path]: file.content } : prev)
      setTruncated(prev => prev[active.path] === undefined ? { ...prev, [active.path]: file.truncated } : prev)
      setPhase('ready')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    })
    return () => { controller.abort() }
  }, [active, fsRead])

  // Restore the open tabs, the active file, and the cached content after a
  // page refresh (a reload used to wipe every tab). Runs once the workspace
  // root is known; a root mismatch (different workspace) skips the restore.
  // Seeding cachedPathsRef keeps restored tabs instant — no disk re-read.
  useEffect(() => {
    const persisted = loadExplorerState()
    if (persisted === null || persisted.root !== root || persisted.tabs.length === 0) return
    for (const tab of persisted.tabs) actions.openFile(tab)
    if (persisted.activePath !== null) actions.activateFile(persisted.activePath)
    const restoredContent: Record<string, string> = {}
    const restoredTruncated: Record<string, boolean> = {}
    for (const [path, file] of Object.entries(persisted.files)) {
      restoredContent[path] = file.text
      if (file.truncated) restoredTruncated[path] = true
      cachedPathsRef.current.add(path)
    }
    setContent(prev => ({ ...prev, ...restoredContent }))
    setTruncated(prev => ({ ...prev, ...restoredTruncated }))
  }, [root, actions])

  // Persist the open tabs and their cached content (debounced). Content is
  // best-effort and size-capped; the tab list itself always survives.
  useEffect(() => {
    if (root === undefined) return
    const timer = setTimeout(() => {
      saveExplorerState({
        root,
        tabs: tabs.map(tab => ({ path: tab.path, name: tab.name })),
        activePath,
        files: Object.fromEntries(
          tabs
            .filter(tab => content[tab.path] !== undefined)
            .map(tab => [tab.path, {
              text: content[tab.path] ?? '',
              truncated: truncated[tab.path] === true,
            }]),
        ),
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [tabs, activePath, content, truncated, root])

  // Poll the active file's on-disk content so external edits (git, other
  // editors) surface automatically — the viewer is read-only, so the new
  // content is adopted directly.
  useEffect(() => {
    if (active === null) return
    const timer = setInterval(() => {
      fsRead(active.path).then((file) => {
        setContent(prev => (prev[active.path] === file.content ? prev : { ...prev, [active.path]: file.content }))
      }).catch(() => {})
    }, FILE_POLL_MS)
    return () => clearInterval(timer)
  }, [active, fsRead])

  // ---- CodeMirror wiring ----
  const cmHostRef = useRef<HTMLDivElement | null>(null)
  const cmRef = useRef<EditorView | null>(null)
  const lastPathRef = useRef<string | null>(null)
  // The update listener reads the latest selection callback through a ref so
  // the editor instance never needs rebuilding for a state change.
  const onEditorSelectionRef = useRef<(state: EditorState) => void>(() => {})

  onEditorSelectionRef.current = (state) => {
    const { from, to } = state.selection.main
    if (to <= from || state.doc.sliceString(from, to).trim() === '') {
      setSelection(null)
      return
    }
    setSelection({ start: state.doc.lineAt(from).number, end: state.doc.lineAt(to).number })
  }

  // Mount the editor once; content/language follow in the sync effect.
  useEffect(() => {
    const host = cmHostRef.current
    if (host === null) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({ doc: '', extensions: [vs2019EditorExtensions, lineNumbers()] }),
    })
    cmRef.current = view
    return () => {
      view.destroy()
      cmRef.current = null
      lastPathRef.current = null
    }
  }, [])

  // Rebuild the editor state when the active tab changes (language rides the
  // state); otherwise sync the doc. The editor is always read-only.
  useEffect(() => {
    const view = cmRef.current
    if (view === null || active === null) return
    const activeContent = content[active.path]
    if (activeContent === undefined) return
    if (lastPathRef.current !== active.path) {
      lastPathRef.current = active.path
      view.setState(EditorState.create({
        doc: activeContent,
        extensions: [
          vs2019EditorExtensions,
          lineNumbers(),
          keymap.of(defaultKeymap),
          languageForPath(active.path),
          EditorState.readOnly.of(true),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet) onEditorSelectionRef.current(update.state)
          }),
        ],
      }))
      return
    }
    const current = view.state.doc.toString()
    if (current !== activeContent) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: activeContent } })
    }
  }, [active?.path, content[active?.path ?? '']])

  // A composer chip click with a line range jumps the editor to those lines:
  // select the range and scroll it into view once the file is active (the
  // seq guard makes repeated clicks on the same chip re-reveal).
  const pendingOpen = usePendingOpen(s => s)
  const lastPendingSeqRef = useRef(0)
  useEffect(() => {
    if (pendingOpen === null) return
    const view = cmRef.current
    if (view === null || active === null || active.path !== pendingOpen.path) return
    if (pendingOpen.lines === null || pendingOpen.seq === lastPendingSeqRef.current) return
    lastPendingSeqRef.current = pendingOpen.seq
    const startLine = Math.min(pendingOpen.lines.start, view.state.doc.lines)
    const endLine = Math.min(pendingOpen.lines.end, view.state.doc.lines)
    const from = view.state.doc.line(startLine).from
    const to = view.state.doc.line(endLine).to
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    })
  }, [pendingOpen, active, actions])

  /** Reference the active file's selected lines in the chat composer as a chip (`path:start-end`). */
  const addSelectionToChat = (): void => {
    if (active === null || selection === null) return
    addFileRef({ path: active.path, name: active.name, lines: { start: selection.start, end: selection.end } })
  }

  // Close a tab and drop its per-tab viewer state.
  const closeTab = (path: string): void => {
    actions.closeFile(path)
    cachedPathsRef.current.delete(path)
    const without = <T,>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== path))
    setContent(prev => without(prev))
    setTruncated(prev => without(prev))
    setSelection(null)
  }

  const activeTruncated = active === null ? false : truncated[active.path] === true
  const activeContent = active === null ? undefined : content[active.path]

  return (
    <div className={css.root}>
      <div className={css.tabs} role="tablist" aria-label={t('viewer.tabsLabel')}>
        {tabs.map(tab => (
          <div
            key={tab.path}
            role="tab"
            aria-selected={tab.path === activePath}
            className={tab.path === activePath ? css.tabActive : css.tab}
            onClick={() => { actions.activateFile(tab.path); actions.requestReveal(tab.path) }}
          >
            <span className={css.tabName} title={tab.path}>{tab.name}</span>
            <button
              type="button"
              className={css.closeButton}
              aria-label={t('viewer.close')}
              title={t('viewer.close')}
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {tabs.length === 0 && <span className={css.tabsEmpty}>{t('viewer.tabsEmpty')}</span>}
      </div>
      {selection !== null && (
        <div className={css.selectionBar}>
          <span className={css.selectionInfo}>
            {selection.start === selection.end
              ? t('viewer.selectedLine', { line: selection.start })
              : t('viewer.selectedLines', { start: selection.start, end: selection.end })}
          </span>
          <button type="button" className={css.addButton} onClick={addSelectionToChat}>
            {t('viewer.addToChat')}
          </button>
        </div>
      )}
      <div className={css.body}>
        {phase === 'idle' && <div className={css.empty}>{t('viewer.empty')}</div>}
        {phase === 'loading' && <div className={css.loading}>{t('viewer.loading')}</div>}
        {phase === 'error' && <div className={css.error}>{t('viewer.error')} {error}</div>}
        <div className={css.cmHost} ref={cmHostRef} data-hidden={phase !== 'ready' || activeContent === undefined} />
        {activeTruncated && <div className={css.truncated}>{t('viewer.truncated')}</div>}
      </div>
    </div>
  )
}
