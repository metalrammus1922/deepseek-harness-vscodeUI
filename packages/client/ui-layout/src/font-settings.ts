/** Workbench font sizes stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the layout plugin (the three-column frame). */
export const FONT_SETTINGS_NAMESPACE = 'ui-fonts'

/** Field carrying the left sidebar (file tree / git / sessions) font size. */
export const SIDEBAR_FONT_SIZE_FIELD = 'sidebarFontSize'

/** Field carrying the center file-viewer (CodeMirror) font size. */
export const EDITOR_FONT_SIZE_FIELD = 'editorFontSize'

/** Field carrying the right AI-chat column font size. */
export const CHAT_FONT_SIZE_FIELD = 'chatFontSize'

/** Default sidebar font size (px); the vscodeui workbench rows render 12–13px. */
export const DEFAULT_SIDEBAR_FONT_SIZE = 13

/** Default editor font size (px); the VS2019-Dark editor ships at 13px. */
export const DEFAULT_EDITOR_FONT_SIZE = 13

/** Default chat font size (px); the conversation markdown body renders 16px. */
export const DEFAULT_CHAT_FONT_SIZE = 16

/** Durable font-size section shared by the Host schema and the browser scope. */
export interface FontSettings {
  /** Left sidebar (file tree / git / sessions) font size in px. */
  sidebarFontSize: number
  /** Center file-viewer (CodeMirror) font size in px. */
  editorFontSize: number
  /** Right AI-chat column font size in px. */
  chatFontSize: number
}

/** Durable font-size schema; also the wire envelope the browser scope validates against. */
export const FontSettingsSchema: z<FontSettings> = z.object({
  [SIDEBAR_FONT_SIZE_FIELD]: z.number().min(8).max(32).default(DEFAULT_SIDEBAR_FONT_SIZE),
  [EDITOR_FONT_SIZE_FIELD]: z.number().min(8).max(32).default(DEFAULT_EDITOR_FONT_SIZE),
  [CHAT_FONT_SIZE_FIELD]: z.number().min(8).max(32).default(DEFAULT_CHAT_FONT_SIZE),
})
