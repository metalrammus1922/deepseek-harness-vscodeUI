/**
 * File tree panel (sidebar.explorer.files): a lazy-loading project tree over
 * ctx.fs.list. The root is the current session's workspace directory, falling
 * back to the first registered workspace. Expanding a directory fetches its
 * children once and caches them for the panel's lifetime; collapsing keeps
 * the cache. Rows are read-only navigation in v1 — no file action yet.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconChevronRightOutline14, IconCodeOutline16, IconFolderClose16, IconFolderOpen16,
  IconRefreshOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { FsEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { FileTreeProps } from './contract/slots.ts'
import css from './FileTree.module.css'

/** One rendered directory level's rows. */
type LevelRows = readonly FsEntry[]

/** Display basename of a root path (both separators accepted). */
function basenameOf(path: string): string {
  return path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
}

export function FileTree({ useWorkspaces, useSessions, fsList, t }: FileTreeProps) {
  const workspaceItems = useWorkspaces(s => s.items)
  const sessionCwd = useSessions(s => {
    const current = s.current
    return current !== undefined ? s.byId[current]?.cwd : undefined
  })
  const root = sessionCwd ?? workspaceItems[0]?.path

  // Lazy tree state: children by directory path ('' = root level), expansion
  // and in-flight markers. All panel-local; no store.
  const [children, setChildren] = useState<Record<string, LevelRows>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const generation = useRef(0)

  /** List one level once (cache for panel lifetime); superseded refreshes ignore late results. */
  const listLevel = useCallback((path: string, signal?: AbortSignal) => {
    const gen = generation.current
    setLoading(prev => {
      const next = new Set(prev)
      next.add(path)
      return next
    })
    fsList(path, signal).then((listing) => {
      if (gen !== generation.current) return
      setChildren(prev => ({ ...prev, [path]: listing.entries }))
      setErrors(prev => { const next = { ...prev }; delete next[path]; return next })
    }).catch((error: unknown) => {
      if (gen !== generation.current) return
      setErrors(prev => ({ ...prev, [path]: error instanceof Error ? error.message : String(error) }))
    }).finally(() => {
      if (gen !== generation.current) return
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    })
  }, [fsList])

  /** Drop everything and re-list the root level. */
  const refresh = useCallback((signal?: AbortSignal) => {
    generation.current += 1
    setChildren({})
    setExpanded(new Set())
    setErrors({})
    setSelected(null)
    if (root === undefined) return
    setRefreshing(true)
    const gen = generation.current
    fsList(root, signal).then((listing) => {
      if (gen !== generation.current) return
      setChildren({ '': listing.entries })
      setRefreshing(false)
    }).catch((error: unknown) => {
      if (gen !== generation.current) return
      setErrors({ '': error instanceof Error ? error.message : String(error) })
      setRefreshing(false)
    })
  }, [root, fsList])

  // Re-root whenever the workspace (or session cwd) changes.
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  /** Expand/collapse one directory; first expansion lists its children. */
  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    if (!expanded.has(path) && children[path] === undefined && !loading.has(path)) {
      listLevel(path)
    }
  }, [expanded, children, loading, listLevel])

  /** Recursive rows for one level. */
  const renderRows = (entries: LevelRows | undefined, depth: number): ReactNode => {
    if (entries === undefined || entries.length === 0) return null
    return entries.map((entry) => {
      const isDirectory = entry.isDirectory
      const isOpen = isDirectory && expanded.has(entry.path)
      const busy = isDirectory && loading.has(entry.path)
      const rowError = errors[entry.path]
      return (
        <Fragment key={entry.path}>
          <button
            type="button"
            className={css.row}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            aria-expanded={isDirectory ? isOpen : undefined}
            aria-selected={selected === entry.path}
            onClick={() => {
              if (isDirectory) toggle(entry.path)
              else setSelected(entry.path)
            }}
          >
            <span className={css.chevronSeat}>
              {isDirectory && (
                <IconChevronRightOutline14 size={12} className={isOpen ? css.chevronOpen : css.chevron} />
              )}
            </span>
            {isDirectory
              ? (isOpen ? <IconFolderOpen16 size={15} className={css.dirIcon} /> : <IconFolderClose16 size={15} className={css.dirIcon} />)
              : <IconCodeOutline16 size={14} className={css.fileIcon} />}
            <span className={css.name} title={entry.path}>{entry.name}</span>
          </button>
          {rowError !== undefined && <div className={css.rowError}>{rowError}</div>}
          {isOpen && busy && <div className={css.busy}>{t('files.loading')}</div>}
          {isOpen && !busy && renderRows(children[entry.path], depth + 1)}
        </Fragment>
      )
    })
  }

  const rootRows = children['']
  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.headerTitle}>{t('files.title')}</span>
        <span className={css.headerPath} title={root}>{root === undefined ? '' : basenameOf(root)}</span>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('files.refresh')}
          title={t('files.refresh')}
          disabled={refreshing || root === undefined}
          onClick={() => refresh()}
        >
          <IconRefreshOutline16 size={14} />
        </button>
      </div>
      <div className={css.body}>
        {root === undefined
          ? <div className={css.empty}>{t('files.noWorkspace')}</div>
          : rootRows === undefined
            ? <div className={css.empty}>{t('files.loading')}</div>
            : rootRows.length === 0
              ? <div className={css.empty}>{t('files.empty')}</div>
              : renderRows(rootRows, 0)}
      </div>
    </div>
  )
}
