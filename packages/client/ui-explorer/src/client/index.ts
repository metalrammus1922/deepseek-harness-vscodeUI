/**
 * Explorer surface plugin, browser half: the file tree, Git panel, and the
 * center file viewer. The tree/Git seats fill ui-sidebar's
 * `sidebar.explorer.files` / `sidebar.explorer.git` holes; the viewer fills
 * ui-layout's `file-viewer` workbench. The tree and viewer consume the
 * injected RPC verbs (listing/read, plus write for the viewer's save path);
 * the root directory comes from the current session's
 * workspace (falling back to the first registered workspace), so the panels
 * always point at the project the user is working in.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the explorer slot declarations).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls ui-layout's SlotMap merge ('file-viewer').
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FileTree } from './FileTree.tsx'
import { FileViewer } from './FileViewer.tsx'
import { GitPanel } from './GitPanel.tsx'
import { createExplorerStore } from './store.ts'
import type { ExplorerInjected } from './contract/slots.ts'
import { en, zh, type ExplorerKey } from './locales.ts'

export { FileTree } from './FileTree.tsx'
export { FileViewer } from './FileViewer.tsx'
export { GitPanel } from './GitPanel.tsx'
export type { ExplorerInjected, FileTreeProps, FileViewerProps, GitPanelProps } from './contract/slots.ts'
export type { ExplorerKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The explorer panels' copy. */
    explorer: ExplorerKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'explorer'

/** Required services: the slot ledger, the workspace/session faces for the root directory, the RPC verbs, and copy. */
export const inject = ['slots', 'workspaces', 'sessions', 'fs', 'git', 'locale']

/**
 * Register the explorer panels once their slot declarations are on the
 * ledger (ui-sidebar's 'sidebar' entry declares the tree/Git holes;
 * ui-layout's 'root' entry declares the viewer seat). The tree and the
 * viewer share one explorer store handle, so a tree click opens the file in
 * the center workbench.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-explorer: dictionaries')

  const injected = (): ExplorerInjected => ({
    fsList: (path, signal) => ctx.fs.list(path, signal),
    fsRead: (path, signal) => ctx.fs.read(path, signal),
    fsWrite: (path, content, signal) => ctx.fs.write(path, content, signal),
    gitStatus: (cwd, signal) => ctx.git.status(cwd, signal),
    gitScan: (root, signal) => ctx.git.scan(root, signal),
    // The conversation layer owns the composer target: this plugin only
    // announces the intent (and the active file for preferred context).
    addToChat: text => ctx.emit('explorer/add-to-chat', { text }),
    onActiveFile: file => ctx.emit('explorer/active-file', file),
  })

  // One handle shared across the two registrations (the sanctioned
  // cross-registration store share): the tree writes the selection, the
  // viewer reads it.
  const explorerStore = createExplorerStore()

  ctx.slots.inject('sidebar.explorer.files', () => ctx.slots.register({
    name: 'sidebar.explorer.files',
    locale: NS,
    store: explorerStore,
    inject: injected,
  }, FileTree))
  ctx.slots.inject('sidebar.explorer.git', () => ctx.slots.register({
    name: 'sidebar.explorer.git',
    locale: NS,
    inject: injected,
  }, GitPanel))
  ctx.slots.inject('file-viewer', () => ctx.slots.register({
    name: 'file-viewer',
    locale: NS,
    store: explorerStore,
    inject: injected,
  }, FileViewer))
}
