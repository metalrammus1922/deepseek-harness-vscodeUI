/**
 * Center file viewer (ui-layout's 'file-viewer' seat): the open file tabs
 * from the shared explorer store, with the active tab's text read through
 * ctx.fs.read. Trae-style workbench: select lines in the textarea and press
 * "添加到对话" to append a `file start-end` reference plus the selected code
 * to the AI chat composer. Root-scoped — no session needed to view files.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileViewerProps } from './contract/slots.ts'
import css from './FileViewer.module.css'

type Phase = 'idle' | 'loading' | 'ready' | 'error'

/** 1-based line of a textarea character offset. */
function lineAt(content: string, offset: number): number {
  return content.slice(0, Math.min(offset, content.length)).split('\n').length
}

/**
 * Render the open file tabs and the active file's content with line-based
 * selection for adding code to the AI chat.
 * @param props - composed slot props (store share + injected verbs + copy).
 * @returns the viewer element tree.
 */
export function FileViewer({ useStore, actions, fsRead, addToChat, onActiveFile, t }: FileViewerProps) {
  const tabs = useStore(s => s.tabs)
  const activePath = useStore(s => s.activePath)
  const active = tabs.find(tab => tab.path === activePath) ?? null

  // Report the active tab as the chat's preferred file context.
  useEffect(() => {
    onActiveFile(active === null ? null : { path: active.path, name: active.name })
  }, [active, onActiveFile])

  const [phase, setPhase] = useState<Phase>('idle')
  const [content, setContent] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)

  // Read the active file; a superseded tab aborts its in-flight read.
  useEffect(() => {
    if (active === null) {
      setPhase('idle')
      setContent(null)
      setError(null)
      setTruncated(false)
      return
    }
    const controller = new AbortController()
    setPhase('loading')
    setContent(null)
    setError(null)
    setTruncated(false)
    fsRead(active.path, controller.signal).then((file) => {
      if (controller.signal.aborted) return
      setContent(file.content)
      setTruncated(file.truncated)
      setPhase('ready')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    })
    return () => { controller.abort() }
  }, [active, fsRead])

  // Keep the line-number gutter scrolling with the textarea.
  const syncScroll = (): void => {
    const area = areaRef.current
    const gutter = gutterRef.current
    if (area === null || gutter === null) return
    gutter.scrollTop = area.scrollTop
  }

  // Selected line range (1-based) from the textarea's native selection.
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const readSelection = (): void => {
    const area = areaRef.current
    if (area === null || content === null) return
    const start = area.selectionStart
    const end = area.selectionEnd
    if (end <= start) {
      setSelection(null)
      return
    }
    const text = content.slice(start, end)
    if (text.trim() === '') {
      setSelection(null)
      return
    }
    const startLine = lineAt(content, start)
    const endLine = lineAt(content, end)
    setSelection({ start: startLine, end: endLine })
  }

  const lineCount = content === null ? 0 : content.split('\n').length
  const gutterNumbers = useMemo(
    () => (lineCount === 0 ? '' : Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n')),
    [lineCount],
  )

  /** Assemble the `name start-end` reference plus the selected lines and send it to the composer. */
  const addSelectionToChat = (): void => {
    const area = areaRef.current
    if (area === null || content === null || active === null || selection === null) return
    const text = content.slice(area.selectionStart, area.selectionEnd)
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

  return (
    <div className={css.root}>
      <div className={css.tabs} role="tablist" aria-label={t('viewer.tabsLabel')}>
        {tabs.map(tab => (
          <div
            key={tab.path}
            role="tab"
            aria-selected={tab.path === activePath}
            className={tab.path === activePath ? css.tabActive : css.tab}
            onClick={() => { actions.activateFile(tab.path) }}
          >
            <span className={css.tabName} title={tab.path}>{tab.name}</span>
            <button
              type="button"
              className={css.closeButton}
              aria-label={t('viewer.close')}
              title={t('viewer.close')}
              onClick={(event) => {
                event.stopPropagation()
                actions.closeFile(tab.path)
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
        {phase === 'ready' && content !== null && (
          <div className={css.codeArea}>
            <div className={css.gutter} ref={gutterRef} aria-hidden="true">
              <pre className={css.gutterNumbers}>{gutterNumbers}</pre>
            </div>
            <textarea
              ref={areaRef}
              className={css.code}
              value={content}
              readOnly
              spellCheck={false}
              onScroll={syncScroll}
              onSelect={readSelection}
              onKeyUp={readSelection}
              onMouseUp={readSelection}
            />
          </div>
        )}
        {truncated && <div className={css.truncated}>{t('viewer.truncated')}</div>}
      </div>
    </div>
  )
}
