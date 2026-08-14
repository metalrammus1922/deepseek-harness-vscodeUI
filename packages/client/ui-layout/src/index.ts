/** Host registration for browser workbench font-size preferences. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { FONT_SETTINGS_NAMESPACE, FontSettingsSchema } from './font-settings.ts'

export {
  CHAT_FONT_SIZE_FIELD, DEFAULT_CHAT_FONT_SIZE, DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_SIDEBAR_FONT_SIZE, EDITOR_FONT_SIZE_FIELD, FONT_SETTINGS_NAMESPACE,
  SIDEBAR_FONT_SIZE_FIELD, type FontSettings,
} from './font-settings.ts'

/**
 * Register the durable font-size section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(FONT_SETTINGS_NAMESPACE),
      FontSettingsSchema,
    )
  })
}
