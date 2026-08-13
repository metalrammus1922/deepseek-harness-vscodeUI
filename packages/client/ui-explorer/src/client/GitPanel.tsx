/**
 * Git source-control panel (sidebar.explorer.git): one read-only working-tree
 * snapshot over ctx.git.status. The inspected directory is the current
 * session's workspace root (falling back to the first registered workspace).
 * Changes group into staged / unstaged / untracked; the header shows the
 * branch and ahead/behind counts, with a manual refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Fragment } from 'react'
import {
  IconBranchOutline16, IconFolderClose16, IconCodeOutline16, IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitStatus, GitStatusEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { GitPanelProps } from './contract/slots.ts'
import css from './GitPanel.module.css'

type Phase = 'loading' | 'ready' | 'error'

/** Status-letter tint: A added, M modified, D deleted, R renamed, ? untracked. */
function letterClass(letter: string): string {
  if (letter === 'A' || letter === '?') return css.letterAdded
  if (letter === 'M') return css.letterModified
  if (letter === 'D') return css.letterDeleted
  if (letter === 'R') return css.letterRenamed
  return css.letterOther
}

/** One group of rows (staged / unstaged / untracked). */
function Group({ label, entries, letterFor, t }: {
  label: string
  entries: readonly GitStatusEntry[]
  letterFor: (entry: GitStatusEntry) => string
  t: GitPanelProps['t']
}) {
  if (entries.length === 0) return null
  return (
    <div className={css.group}>
      <div className={css.groupHeader}>{label} <span className={css.count}>{entries.length}</span></div>
      {entries.map(entry => (
        <div key={entry.path} className={css.row} title={entry.path}>
          <span className={`${css.letter} ${letterClass(letterFor(entry))}`}>{letterFor(entry)}</span>
          {entry.directory ? <IconFolderClose16 size={14} className={css.fileIcon} /> : <IconCodeOutline16 size={13} className={css.fileIcon} />}
          <span className={css.name}>{entry.path}</span>
        </div>
      ))}
    </div>
  )
}

export function GitPanel({ useWorkspaces, useSessions, gitStatus, t }: GitPanelProps) {
  const workspaceItems = useWorkspaces(s => s.items)
  const sessionCwd = useSessions(s => {
    const current = s.current
    return current !== undefined ? s.byId[current]?.cwd : undefined
  })
  const cwd = sessionCwd ?? workspaceItems[0]?.path

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  const load = useCallback((signal?: AbortSignal) => {
    if (cwd === undefined) { setStatus(null); setPhase('ready'); return }
    const gen = ++generation.current
    setPhase('loading')
    setError(null)
    gitStatus(cwd, signal).then((next) => {
      if (gen !== generation.current) return
      setStatus(next)
      setPhase('ready')
    }).catch((reason: unknown) => {
      if (gen !== generation.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    })
  }, [cwd, gitStatus])

  // Reload when the inspected directory changes (workspace switch).
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const staged = status?.entries.filter(entry => entry.staged) ?? []
  const unstaged = status?.entries.filter(entry => !entry.staged && !entry.untracked) ?? []
  const untracked = status?.entries.filter(entry => entry.untracked) ?? []
  const branch = status?.branch
  const showAhead = status !== null && status.ahead > 0
  const showBehind = status !== null && status.behind > 0

  return (
    <div className={css.root}>
      <div className={css.header}>
        <IconBranchOutline16 size={14} className={css.branchIcon} />
        <span className={css.branch} title={branch ?? undefined}>{branch ?? '—'}</span>
        {showAhead && <span className={`${css.countBadge} ${css.ahead}`}>{t('git.ahead', { n: status!.ahead })}</span>}
        {showBehind && <span className={`${css.countBadge} ${css.behind}`}>{t('git.behind', { n: status!.behind })}</span>}
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('git.refresh')}
          title={t('git.refresh')}
          disabled={phase === 'loading' || cwd === undefined}
          onClick={() => load()}
        >
          <IconRefreshOutline16 size={14} />
        </button>
      </div>
      <div className={css.body}>
        {phase === 'loading' && <div className={css.placeholder}>{t('git.loading')}</div>}
        {phase === 'error' && <div className={css.error}>{error ?? t('git.error')}</div>}
        {phase === 'ready' && status !== null && !status.isRepo && <div className={css.placeholder}>{t('git.notRepo')}</div>}
        {phase === 'ready' && status !== null && status.isRepo && status.entries.length === 0
          && <div className={css.placeholder}>{t('git.clean')}</div>}
        {phase === 'ready' && status !== null && status.isRepo && status.entries.length > 0 && (
          <Fragment>
            <Group label={t('git.staged')} entries={staged} letterFor={entry => entry.x} t={t} />
            <Group label={t('git.changes')} entries={unstaged} letterFor={entry => entry.y} t={t} />
            <Group label={t('git.untracked')} entries={untracked} letterFor={() => '?'} t={t} />
          </Fragment>
        )}
      </div>
    </div>
  )
}
