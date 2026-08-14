/**
 * Git source-control panel (sidebar.explorer.git): walks the session workspace
 * root for every git repository and lists them flat, VSCode-SCM style. Each
 * repository row shows its name, branch, and uncommitted-file count; expanding
 * it lists the uncommitted files. Read-only — no stage/commit actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Fragment } from 'react'
import {
  IconBranchOutline16, IconChevronRightOutline14, IconCodeOutline16,
  IconFolderClose16, IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GitScan, GitScannedRepo, GitStatusEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { GitPanelProps } from './contract/slots.ts'
import css from './GitPanel.module.css'

type Phase = 'loading' | 'ready' | 'error'

/** Status-letter tint: A added, M modified, D deleted, R renamed, ? untracked. */
function letterClass(letter: string): string {
  if (letter === 'A' || letter === '?') return css.letterAdded ?? ''
  if (letter === 'M') return css.letterModified ?? ''
  if (letter === 'D') return css.letterDeleted ?? ''
  if (letter === 'R') return css.letterRenamed ?? ''
  return css.letterOther ?? ''
}

/** One uncommitted file row: status letter + repo-relative path. */
function FileRow({ entry, letterFor }: {
  entry: GitStatusEntry
  letterFor: (entry: GitStatusEntry) => string
}) {
  return (
    <div className={css.row} title={entry.path}>
      <span className={`${css.letter} ${letterClass(letterFor(entry))}`}>{letterFor(entry)}</span>
      {entry.directory
        ? <IconFolderClose16 size={14} className={css.fileIcon} />
        : <IconCodeOutline16 size={13} className={css.fileIcon} />}
      <span className={css.name}>{entry.path}</span>
    </div>
  )
}

/** One discovered repository row (expandable) plus its uncommitted files. */
function RepoSection({ repo, expanded, onToggle, t }: {
  repo: GitScannedRepo
  expanded: boolean
  onToggle: (path: string) => void
  t: GitPanelProps['t']
}) {
  return (
    <Fragment>
      <button type="button" className={css.repoRow} onClick={() => onToggle(repo.path)}
        aria-expanded={expanded} title={repo.path}>
        <IconChevronRightOutline14 size={12} className={expanded ? css.chevronOpen : css.chevron} />
        <IconFolderClose16 size={15} className={css.repoIcon} />
        <span className={css.repoName}>{repo.name}</span>
        {repo.branch !== null && <span className={css.repoBranch}>{repo.branch}</span>}
        {repo.files.length > 0 && <span className={css.countBadge}>{repo.files.length}</span>}
      </button>
      {expanded && (
        <div className={css.repoFiles}>
          {repo.files.length === 0 && <div className={css.placeholder}>{t('git.clean')}</div>}
          {repo.files.map(entry => (
            <FileRow key={`${repo.path}:${entry.path}`} entry={entry}
              letterFor={entry => (entry.untracked ? '?' : entry.staged ? entry.x : entry.y)} />
          ))}
        </div>
      )}
    </Fragment>
  )
}

export function GitPanel({ useWorkspaces, useSessions, gitScan, t }: GitPanelProps) {
  const workspaceItems = useWorkspaces(s => s.items)
  const sessionCwd = useSessions((s) => {
    const current = s.current
    return current !== undefined ? s.byId[current]?.cwd : undefined
  })
  const root = sessionCwd ?? workspaceItems[0]?.path

  const [scan, setScan] = useState<GitScan | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const generation = useRef(0)

  const load = useCallback((signal?: AbortSignal) => {
    if (root === undefined) { setScan(null); setPhase('ready'); return }
    const gen = ++generation.current
    setPhase('loading')
    setError(null)
    gitScan(root, signal).then((next) => {
      if (gen !== generation.current) return
      setScan(next)
      setPhase('ready')
      // Drop expansion state for repositories that disappeared from the scan.
      setExpanded((prev) => {
        const keep = new Set(prev)
        for (const path of prev) {
          if (!next.repos.some(repo => repo.path === path)) keep.delete(path)
        }
        return keep.size === prev.size ? prev : keep
      })
    }).catch((reason: unknown) => {
      if (gen !== generation.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setPhase('error')
    })
  }, [root, gitScan])

  // Reload when the scanned root changes (workspace switch).
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  const totalFiles = scan?.repos.reduce((sum, repo) => sum + repo.files.length, 0) ?? 0

  return (
    <div className={css.root}>
      <div className={css.header}>
        <IconBranchOutline16 size={14} className={css.branchIcon} />
        <span className={css.title}>{t('git.title')}</span>
        {scan !== null && (
          <span className={css.scanTotal}>{t('git.scanTotal', { repos: scan.repos.length, files: totalFiles })}</span>
        )}
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('git.refresh')}
          title={t('git.refresh')}
          disabled={phase === 'loading' || root === undefined}
          onClick={() => load()}
        >
          <IconRefreshOutline16 size={14} />
        </button>
      </div>
      <div className={css.body}>
        {phase === 'loading' && <div className={css.placeholder}>{t('git.loading')}</div>}
        {phase === 'error' && <div className={css.error}>{error ?? t('git.error')}</div>}
        {phase === 'ready' && scan !== null && scan.repos.length === 0
          && <div className={css.placeholder}>{t('git.noRepos')}</div>}
        {phase === 'ready' && scan !== null && scan.repos.map(repo => (
          <RepoSection key={repo.path} repo={repo}
            expanded={expanded.has(repo.path)} onToggle={toggle} t={t} />
        ))}
      </div>
    </div>
  )
}
