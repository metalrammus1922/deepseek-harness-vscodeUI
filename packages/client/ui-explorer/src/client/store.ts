/**
 * Explorer selection store: the open file tabs and the active one. Declared
 * on the file-tree entry and shared by handle with the file-viewer entry (the
 * cross-registration share the store seat exists for), so a click in the tree
 * opens or activates a tab in the center workbench without any cross-package
 * service.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** One opened file in the center file viewer. */
export interface OpenedFile {
  /** Absolute host path (opened from a tree row, never joined client-side). */
  path: string
  /** Display basename for the viewer tab. */
  name: string
}

/** One tree-reveal request (bumped by a viewer tab click). */
export interface RevealRequest {
  /** Path to reveal in the file tree; null clears the request. */
  path: string | null
  /** Monotonic bump so repeated requests for the same path still fire. */
  seq: number
}

/** Viewer state: the open tabs, the active tab's path, and reveal requests. */
type ExplorerState = {
  tabs: OpenedFile[]
  activePath: string | null
  /** Tree-reveal request: written only by a viewer tab click, so the file
   * tree scrolls on tab switches but never yanks the user's manual scroll
   * during tree browsing or auto-refresh. */
  reveal: RevealRequest
}

/** The complete mutation set of the explorer store. */
type ExplorerActions = {
  /** Open (or re-activate) one file: upserts its tab and activates it. */
  openFile: (draft: ExplorerState, file: OpenedFile) => void
  /** Activate an existing tab by path; unknown paths are ignored. */
  activateFile: (draft: ExplorerState, path: string) => void
  /** Close one tab; closing the active tab activates its right neighbour. */
  closeFile: (draft: ExplorerState, path: string) => void
  /** Request the file tree to reveal a path (a viewer tab click, never a tree open). */
  requestReveal: (draft: ExplorerState, path: string) => void
}

/**
 * Create the explorer selection store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createExplorerStore(): EngineStoreHandle<ExplorerState, ExplorerActions> {
  const handle = defineStore({
    init: (): ExplorerState => ({ tabs: [], activePath: null, reveal: { path: null, seq: 0 } }),
    actions: {
      openFile: (d, file) => {
        const index = d.tabs.findIndex(tab => tab.path === file.path)
        if (index === -1) d.tabs = [...d.tabs, file]
        else d.tabs = d.tabs.map((tab, position) => position === index ? file : tab)
        d.activePath = file.path
      },
      activateFile: (d, path) => {
        if (d.tabs.some(tab => tab.path === path)) d.activePath = path
      },
      closeFile: (d, path) => {
        const index = d.tabs.findIndex(tab => tab.path === path)
        if (index === -1) return
        d.tabs = d.tabs.filter(tab => tab.path !== path)
        if (d.activePath !== path) return
        if (d.tabs.length === 0) {
          d.activePath = null
          return
        }
        // The closed tab's right neighbour takes over; past the end, the new
        // tail does.
        d.activePath = d.tabs[Math.min(index, d.tabs.length - 1)]?.path ?? null
      },
      requestReveal: (d, path) => {
        d.reveal = { path, seq: d.reveal.seq + 1 }
      },
    },
  })
  return handle
}
