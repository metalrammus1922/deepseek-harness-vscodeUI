/**
 * Global font-size DOM applier: projects the resolved FontSettings onto
 * document.body as the three workbench CSS variables the frame columns
 * consume (`--dsh-font-sidebar`, `--dsh-font-editor`, `--dsh-font-chat`).
 * Pure DOM writes, no React involvement; the presenter only ever retracts
 * what it wrote itself, so foreign inline styles survive.
 */
import type { FontSettings } from '../font-settings.ts'

/** Body variable carrying the left sidebar (file tree / git / sessions) font size. */
export const SIDEBAR_FONT_VAR = '--dsh-font-sidebar'

/** Body variable carrying the center file-viewer (CodeMirror) font size. */
export const EDITOR_FONT_VAR = '--dsh-font-editor'

/** Body variable carrying the right AI-chat column font size. */
export const CHAT_FONT_VAR = '--dsh-font-chat'

/** Applies font-size settings to the document; one instance per plugin fiber. */
export class FontSizePresenter {
  /** Variable names this presenter wrote in the last apply (its retraction set). */
  private applied: string[] = []

  /**
   * Project one settings section onto the document body: replace the
   * previously applied font-size variables with the section's values.
   * @param fonts - resolved workbench font sizes from the settings scope.
   */
  apply(fonts: FontSettings): void {
    const body = document.body
    for (const name of this.applied) body.style.removeProperty(name)
    const next = [
      [SIDEBAR_FONT_VAR, `${fonts.sidebarFontSize}px`],
      [EDITOR_FONT_VAR, `${fonts.editorFontSize}px`],
      [CHAT_FONT_VAR, `${fonts.chatFontSize}px`],
    ] as const
    this.applied = []
    for (const [name, value] of next) {
      body.style.setProperty(name, value)
      this.applied.push(name)
    }
  }

  /** Retract every font-size variable this presenter wrote. */
  dispose(): void {
    const body = document.body
    for (const name of this.applied) body.style.removeProperty(name)
    this.applied = []
  }
}
