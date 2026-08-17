/**
 * Browser-side persistence for the file viewer's open tabs and their cached
 * content. localStorage survives a page refresh, so the user's opened files
 * (and, within a size budget, their text) come back instead of vanishing;
 * the payload is keyed by the workspace root so a different workspace never
 * restores another one's tabs. The store's built-in persist is not used:
 * content lives in FileViewer state, and the root guard needs the workspace
 * face, which only the component sees.
 */
import type { OpenedFile } from './store.ts'

/** localStorage key for the explorer viewer state. */
export const EXPLORER_STORAGE_KEY = 'dsh-vscodeui.explorer.v1'

/** Per-file content budget: larger files stay on disk and reload on demand. */
const FILE_CHAR_CAP = 200_000

/** One cached file's viewer state (read-only content + truncation). */
export interface PersistedFileState {
  /** The file's text as last read from disk. */
  text: string
  /** Whether the read was truncated (a notice shows in the viewer). */
  truncated: boolean
}

/** The persisted viewer state: open tabs, the active one, and cached content. */
export interface PersistedExplorer {
  /** The workspace root these tabs belong to; a mismatch skips the restore. */
  root: string
  /** Open tabs in order (the viewer's tab strip). */
  tabs: OpenedFile[]
  /** The active tab's path, or null when no tab is open. */
  activePath: string | null
  /** Cached per-tab editor state keyed by absolute path (best effort). */
  files: Record<string, PersistedFileState>
}

/**
 * Read the persisted viewer state.
 * @returns the saved state, or null when absent, unparseable, or malformed.
 */
export function loadExplorerState(): PersistedExplorer | null {
  try {
    const raw = window.localStorage.getItem(EXPLORER_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<PersistedExplorer>
    if (typeof parsed.root !== 'string' || !Array.isArray(parsed.tabs) || parsed.files === undefined) {
      return null
    }
    return parsed as PersistedExplorer
  } catch {
    return null
  }
}

/**
 * Persist the viewer state. Oversized content is dropped; a storage failure
 * (quota, private mode) degrades to the tab list alone so the tabs always
 * survive, and a total failure leaves persistence silently disabled.
 * @param state - the current viewer state.
 */
export function saveExplorerState(state: PersistedExplorer): void {
  const files = Object.fromEntries(
    Object.entries(state.files).filter(([, file]) => file.text.length <= FILE_CHAR_CAP),
  )
  try {
    window.localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({ ...state, files }))
  } catch {
    try {
      window.localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({ ...state, files: {} }))
    } catch {
      // No storage: the viewer simply does not persist.
    }
  }
}
