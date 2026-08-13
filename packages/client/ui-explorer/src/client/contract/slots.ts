/**
 * Sidebar explorer slot contracts: the injected RPC verbs the file tree and
 * Git panel render against. The two slots themselves are declared by
 * ui-sidebar's 'sidebar' entry (this package registers into them, the same
 * ownership split as sidebar.workspaces).
 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the explorer slot entries) into
// every program that sees this contract, so PropsRuntime<'sidebar.explorer.files'>
// resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { FsListing, GitStatus } from '@deepseek-ai/dsh-api-remotes/client'
import type { ExplorerKey } from '../locales.ts'

/** RPC verbs injected by this plugin's apply (read-only host calls). */
export interface ExplorerInjected {
  /** List one directory level — files AND subdirectories (the file tree's source). */
  fsList(path: string, signal?: AbortSignal): Promise<FsListing>
  /** One-shot git status snapshot for a directory. */
  gitStatus(cwd: string, signal?: AbortSignal): Promise<GitStatus>
}

/** Full props of the file-tree entry. */
export type FileTreeProps = PropsRuntime<'sidebar.explorer.files'> & PropsLocale<'explorer'> & ExplorerInjected

/** Full props of the Git entry. */
export type GitPanelProps = PropsRuntime<'sidebar.explorer.git'> & PropsLocale<'explorer'> & ExplorerInjected

/** The explorer namespace key union, re-exported for consumers. */
export type { ExplorerKey }
