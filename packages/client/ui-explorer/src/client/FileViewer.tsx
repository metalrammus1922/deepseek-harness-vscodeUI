/**
 * Center file viewer (ui-layout's 'file-viewer' seat): the file the sidebar
 * explorer opened, read through ctx.fs.read. Root-scoped — no session needed.
 * Reads on every selection change, aborts the in-flight read when the
 * selection moves on, and surfaces host errors instead of hanging.
 */
import { useEffect, useState } from 'react'
import type { FileViewerProps } from './contract/slots.ts'
import css from './FileViewer.module.css'

type Phase = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Render the opened file's text content.
 * @param props - composed slot props (store share + injected fs read + copy).
 * @returns the viewer element tree.
 */
export function FileViewer({ useStore, actions, fsRead, t }: FileViewerProps) {
  const open = useStore(s => s.open)
  const [phase, setPhase] = useState<Phase>('idle')
  const [content, setContent] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read the selected file; a superseded selection aborts its in-flight read.
  useEffect(() => {
    if (open === null) {
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
    fsRead(open.path, controller.signal).then((file) => {
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
  }, [open, fsRead])

  return (
    <div className={css.root}>
      <div className={css.header}>
        {open !== null && (
          <div className={css.tab}>
            <span className={css.tabName} title={open.path}>{open.name}</span>
            <button
              type="button"
              className={css.closeButton}
              aria-label={t('viewer.close')}
              title={t('viewer.close')}
              onClick={() => { actions.closeFile() }}
            >
              ×
            </button>
          </div>
        )}
        <span className={css.path} title={open?.path ?? undefined}>{open?.path ?? ''}</span>
      </div>
      <div className={css.body}>
        {phase === 'idle' && <div className={css.empty}>{t('viewer.empty')}</div>}
        {phase === 'loading' && <div className={css.loading}>{t('viewer.loading')}</div>}
        {phase === 'error' && <div className={css.error}>{t('viewer.error')} {error}</div>}
        {phase === 'ready' && content !== null && (
          <>
            {truncated && <div className={css.truncated}>{t('viewer.truncated')}</div>}
            <pre className={css.code}>{content}</pre>
          </>
        )}
      </div>
    </div>
  )
}
