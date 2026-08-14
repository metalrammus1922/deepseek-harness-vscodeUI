/**
 * Explorer selection store: the file the center viewer shows. Declared on the
 * file-tree entry and shared by handle with the file-viewer entry (the
 * cross-registration share the store seat exists for), so a click in the tree
 * opens the file in the center workbench without any cross-package service.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** One opened file in the center file viewer. */
export interface OpenedFile {
  /** Absolute host path (opened from a tree row, never joined client-side). */
  path: string
  /** Display basename for the viewer tab. */
  name: string
}

/** Viewer-selection state: at most one open file. */
type ExplorerState = { open: OpenedFile | null }

/** The complete mutation set of the explorer store. */
type ExplorerActions = {
  /** Open (or switch to) one file. */
  openFile: (draft: ExplorerState, file: OpenedFile) => void
  /** Close the viewer back to its empty state. */
  closeFile: (draft: ExplorerState) => void
}

/**
 * Create the explorer selection store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createExplorerStore(): EngineStoreHandle<ExplorerState, ExplorerActions> {
  const handle = defineStore({
    init: (): ExplorerState => ({ open: null }),
    actions: {
      openFile: (d, file) => { d.open = file },
      closeFile: (d) => { d.open = null },
    },
  })
  return handle
}
