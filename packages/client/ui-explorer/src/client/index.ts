/**
 * Explorer surface plugin, browser half: the file tree and Git panels that
 * fill ui-sidebar's `sidebar.explorer.files` / `sidebar.explorer.git`
 * holes. Both are read-only consumers of the injected RPC verbs; the root
 * directory comes from the current session's workspace (falling back to the
 * first registered workspace), so the panels always point at the project the
 * user is working in.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated Remote API and ctx.remote merge through the Client assembly boundary.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the explorer slot declarations).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { FileTree } from './FileTree.tsx'
import { GitPanel } from './GitPanel.tsx'
import type { ExplorerInjected } from './contract/slots.ts'
import { en, zh, type ExplorerKey } from './locales.ts'

export { FileTree } from './FileTree.tsx'
export { GitPanel } from './GitPanel.tsx'
export type { ExplorerInjected, FileTreeProps, GitPanelProps } from './contract/slots.ts'
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
 * Register the two explorer panels once their slot declarations are on the
 * ledger (ui-sidebar's 'sidebar' entry declares them; this plugin fills them).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-explorer: dictionaries')

  const injected = (): ExplorerInjected => ({
    fsList: (path, signal) => ctx.fs.list(path, signal),
    gitStatus: (cwd, signal) => ctx.git.status(cwd, signal),
  })

  ctx.slots.inject('sidebar.explorer.files', () => ctx.slots.register({
    name: 'sidebar.explorer.files',
    locale: NS,
    inject: injected,
  }, FileTree))
  ctx.slots.inject('sidebar.explorer.git', () => ctx.slots.register({
    name: 'sidebar.explorer.git',
    locale: NS,
    inject: injected,
  }, GitPanel))
}
