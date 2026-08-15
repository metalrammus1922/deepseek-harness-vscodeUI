/**
 * Explorer slot contracts: the injected RPC verbs the file tree, Git panel,
 * and center file viewer render against. The tree/Git seats are declared by
 * ui-sidebar's 'sidebar' entry; the viewer seat by ui-layout's 'file-viewer'
 * (this package registers into all three, the same ownership split as
 * sidebar.workspaces).
 */
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the explorer slot entries) into
// every program that sees this contract, so PropsRuntime<'sidebar.explorer.files'>
// resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ui-layout's SlotMap merge ('file-viewer') into every program
// that sees this contract, so PropsRuntime<'file-viewer'> resolves.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { FsFile, FsListing, FsWriteResult, GitScan, GitStatus } from '@deepseek-ai/dsh-api-remotes/client'
import type { ExplorerKey } from '../locales.ts'
import type { createExplorerStore } from '../store.ts'

/** RPC verbs injected by this plugin's apply (host calls). */
export interface ExplorerInjected {
  /** List one directory level — files AND subdirectories (the file tree's source). */
  fsList(path: string, signal?: AbortSignal): Promise<FsListing>
  /** Read one file's text content (the center viewer's source). */
  fsRead(path: string, signal?: AbortSignal): Promise<FsFile>
  /** Write one file's text content (the center viewer's save path). */
  fsWrite(path: string, content: string, signal?: AbortSignal): Promise<FsWriteResult>
  /** One-shot git status snapshot for a directory. */
  gitStatus(cwd: string, signal?: AbortSignal): Promise<GitStatus>
  /** Walk a directory tree and report every git repository under it (flat), each with its uncommitted files. */
  gitScan(root: string, signal?: AbortSignal): Promise<GitScan>
  /** Reference the viewer's active file (with its selected lines) in the AI chat composer as a chip. */
  addFileRef(ref: { path: string; name: string; lines: { start: number; end: number } | null }): void
  /** Report the viewer's active tab (with its selected line range) so the chat treats it as preferred context. */
  onActiveFile(file: { path: string; name: string; lines: { start: number; end: number } | null } | null): void
  /**
   * Registrant hooks compartment: a composer chip click announces the file
   * to open; the renderer binds usePendingOpen from this source.
   */
  hooks: {
    /** One open-request (seq bumps so repeated clicks on the same path fire). */
    pendingOpen: ObservableSnapshot<{ path: string; lines: { start: number; end: number } | null; seq: number } | null>
  }
}

/** Full props of the file-tree entry (opens files through the shared store). */
export type FileTreeProps =
  & PropsRuntime<'sidebar.explorer.files'>
  & PropsStore<ReturnType<typeof createExplorerStore>>
  & PropsLocale<'explorer'>
  & InjectFace<ExplorerInjected>

/** Full props of the Git entry. */
export type GitPanelProps = PropsRuntime<'sidebar.explorer.git'> & PropsLocale<'explorer'> & InjectFace<ExplorerInjected>

/** Full props of the center file-viewer entry. */
export type FileViewerProps =
  & PropsRuntime<'file-viewer'>
  & PropsStore<ReturnType<typeof createExplorerStore>>
  & PropsLocale<'explorer'>
  & InjectFace<ExplorerInjected>

/** The explorer namespace key union, re-exported for consumers. */
export type { ExplorerKey }
