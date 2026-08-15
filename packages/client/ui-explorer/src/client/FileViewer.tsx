/**
 * Center file viewer (ui-layout's 'file-viewer' seat): the open file tabs
 * from the shared explorer store, with the active tab's text read through
 * ctx.fs.read and written back through ctx.fs.write. The editor is a
 * CodeMirror 6 instance themed as VS2019 Dark with per-extension syntax
 * highlighting; select code and press "添加到对话" to append a `file
 * start-end` reference plus the selection to the AI chat composer; edit
 * in place and save with the toolbar button or Ctrl+S. Root-scoped — no
 * session needed to view files.
 */
import { useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import type { FileViewerProps } from './contract/slots.ts'
import { languageForPath } from './language.ts'
import { vs2019EditorExtensions } from './vs2019-theme.ts'
import css from './FileViewer.module.css'

type Phase = 'idle' | 'loading' | 'ready' | 'error'

/** External-change poll interval for the active file. */
const FILE_POLL_MS = 1000

/**
 * Render the open file tabs and the active file's content in a VS2019-Dark
 * CodeMirror editor with line-based selection for adding code to the AI
 * chat and in-place editing saved back through fsWrite. Each open tab keeps
 * its own draft, so switching tabs never loses unsaved edits; truncated
 * reads stay read-only (saving them would overwrite the file with the cut
 * content).
 * @param props - composed slot props (store share + injected verbs + copy).
 * @returns the viewer element tree.
 */
export function FileViewer({ useStore, actions, fsRead, fsWrite, addToChat, onActiveFile, t }: FileViewerProps) {
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const active = tabs.find(tab => tab.path === activePath) ?? null

  // Report the active tab as the chat's preferred file context.
  useEffect(() => {
    onActiveFile(active === null ? null : { path: active.path, name: active.name })
  }, [active, onActiveFile])

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  // Per-tab editor state: the on-disk base text and the current working copy.
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [truncated, setTruncated] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Latest on-disk content of each tab, tracked by the external-change poll.
  const [disk, setDisk] = useState<Record<string, string>>({})
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
      setSaved(prev => prev[active.path] === undefined ? { ...prev, [active.path]: file.content } : prev)
      setDrafts(prev => prev[active.path] === undefined ? { ...prev, [active.path]: file.content } : prev)
      setTruncated(prev => prev[active.path] === undefined ? { ...prev, [active.path]: file.truncated } : prev)
      setPhase('ready')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    })
    return () => { controller.abort() }
  }, [active, fsRead])

  const activeSaved = active === null ? undefined : saved[active.path]
  const activeDraft = active === null ? undefined : drafts[active.path]
  const activeDisk = active === null ? undefined : disk[active.path]
  const activeTruncated = active === null ? false : truncated[active.path] === true
  const dirty = active !== null && activeSaved !== undefined && activeDraft !== undefined
    && activeDraft !== activeSaved
  const externallyChanged = active !== null && activeDisk !== undefined && activeSaved !== undefined
    && activeDisk !== activeSaved

  // Save the active tab's draft back to disk; success moves the saved base
  // forward so the tab turns clean.
  const save = async (): Promise<void> => {
    if (active === null || activeDraft === undefined || saving || activeTruncated) return
    setSaving(true)
    setSaveError(null)
    try {
      await fsWrite(active.path, activeDraft)
      setSaved(prev => ({ ...prev, [active.path]: activeDraft }))
      setTruncated(prev => ({ ...prev, [active.path]: false }))
    } catch (reason: unknown) {
      setSaveError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  // Poll the active file's on-disk content so external edits (git, other
  // editors) surface without a manual reload.
  useEffect(() => {
    if (active === null) return
    const timer = setInterval(() => {
      fsRead(active.path).then((file) => {
        setDisk(prev => (prev[active.path] === file.content ? prev : { ...prev, [active.path]: file.content }))
      }).catch(() => {})
    }, FILE_POLL_MS)
    return () => clearInterval(timer)
  }, [active, fsRead])

  // Adopt an external change silently when the tab is not locally dirty;
  // a dirty tab keeps the editor content and shows the reload bar instead.
  useEffect(() => {
    if (active === null || activeDisk === undefined || activeSaved === undefined) return
    if (activeDisk !== activeSaved && activeDraft === activeSaved) {
      setSaved(prev => ({ ...prev, [active.path]: activeDisk }))
      setDrafts(prev => ({ ...prev, [active.path]: activeDisk }))
    }
  }, [active, activeDisk, activeSaved, activeDraft])

  // Discard local edits and load the on-disk version of the active tab.
  const reloadFromDisk = (): void => {
    if (active === null || activeDisk === undefined) return
    setSaved(prev => ({ ...prev, [active.path]: activeDisk }))
    setDrafts(prev => ({ ...prev, [active.path]: activeDisk }))
    setSaveError(null)
  }

  // Ctrl/Cmd+S saves the active tab and never falls through to the browser's
  // save-as dialog while a file is open. Re-subscribes each render so the
  // listener always captures the current tab and draft.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && active !== null) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  })

  // ---- CodeMirror wiring ----
  const cmHostRef = useRef<HTMLDivElement | null>(null)
  const cmRef = useRef<EditorView | null>(null)
  const lastPathRef = useRef<string | null>(null)
  const lastReadOnlyRef = useRef(false)
  // The update listener reads the latest callbacks through refs so the
  // editor instance never needs rebuilding for a state change.
  const onEditorChangeRef = useRef<(path: string, doc: string) => void>(() => {})
  const onEditorSelectionRef = useRef<(state: EditorState) => void>(() => {})

  // Selected line range (1-based) from the CodeMirror selection.
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)

  onEditorChangeRef.current = (path, doc) => {
    setDrafts(prev => (prev[path] === doc ? prev : { ...prev, [path]: doc }))
    if (active !== null && path === active.path) setSaveError(null)
  }
  onEditorSelectionRef.current = (state) => {
    const { from, to } = state.selection.main
    if (to <= from || state.doc.sliceString(from, to).trim() === '') {
      setSelection(null)
      return
    }
    setSelection({ start: state.doc.lineAt(from).number, end: state.doc.lineAt(to).number })
  }

  // Mount the editor once; content/language/read-only follow in the sync effect.
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
      lastReadOnlyRef.current = false
    }
  }, [])

  // Rebuild the editor state when the active tab or its read-only guard
  // changes (language + readOnly ride the state); otherwise sync the doc.
  useEffect(() => {
    const view = cmRef.current
    if (view === null || active === null || activeDraft === undefined) return
    if (lastPathRef.current !== active.path || lastReadOnlyRef.current !== activeTruncated) {
      lastPathRef.current = active.path
      lastReadOnlyRef.current = activeTruncated
      view.setState(EditorState.create({
        doc: activeDraft,
        extensions: [
          vs2019EditorExtensions,
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          languageForPath(active.path),
          EditorState.readOnly.of(activeTruncated),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onEditorChangeRef.current(active.path, update.state.doc.toString())
            if (update.docChanged || update.selectionSet) onEditorSelectionRef.current(update.state)
          }),
        ],
      }))
      return
    }
    const current = view.state.doc.toString()
    if (current !== activeDraft) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: activeDraft } })
    }
  }, [active?.path, activeDraft, activeTruncated])

  /** Assemble the `name start-end` reference plus the selected lines and send it to the composer. */
  const addSelectionToChat = (): void => {
    const view = cmRef.current
    if (view === null || active === null || selection === null) return
    const { from, to } = view.state.selection.main
    const text = view.state.doc.sliceString(from, to)
    const body = [
      selection.start === selection.end
        ? `${active.name} ${selection.start}`
        : `${active.name} ${selection.start}-${selection.end}`,
      active.path,
      text,
    ].join('\n')
    addToChat(body)
    setSelection(null)
  }

  // Close a tab and drop its per-tab editor state (unsaved drafts are
  // discarded, mirroring the plain tab-close action).
  const closeTab = (path: string): void => {
    actions.closeFile(path)
    cachedPathsRef.current.delete(path)
    const without = <T,>(record: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== path))
    setDrafts(prev => without(prev))
    setSaved(prev => without(prev))
    setTruncated(prev => without(prev))
    setSelection(null)
  }

  const tabDirty = (path: string): boolean =>
    saved[path] !== undefined && drafts[path] !== undefined && drafts[path] !== saved[path]

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
            {tabDirty(tab.path) && <span className={css.dirtyDot} title={t('viewer.modified')} aria-label={t('viewer.modified')} />}
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
      {(dirty || saving || saveError !== null || activeTruncated || externallyChanged) && (
        <div className={css.editorBar}>
          <span className={saveError !== null ? css.editorBarError
            : activeTruncated || externallyChanged ? css.editorBarWarning
              : css.editorBarInfo}>
            {saveError !== null ? `${t('viewer.saveFailed')} ${saveError}`
              : activeTruncated ? t('viewer.truncatedNoEdit')
                : externallyChanged ? t('viewer.diskChanged')
                  : t('viewer.modified')}
          </span>
          {externallyChanged && (
            <button type="button" className={css.reloadButton} onClick={reloadFromDisk}>
              {t('viewer.reload')}
            </button>
          )}
          {!activeTruncated && (
            <button type="button" className={css.saveButton} disabled={!dirty || saving}
              title={t('viewer.saveShortcut')} onClick={() => void save()}>
              {saving ? t('viewer.saving') : t('viewer.save')}
            </button>
          )}
        </div>
      )}
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
        <div className={css.cmHost} ref={cmHostRef} data-hidden={phase !== 'ready' || activeDraft === undefined} />
        {activeTruncated && <div className={css.truncated}>{t('viewer.truncated')}</div>}
      </div>
    </div>
  )
}
