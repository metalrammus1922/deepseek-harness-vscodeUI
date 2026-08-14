// @vitest-environment jsdom
// FontSizePresenter behavior account: an apply replaces the previous set of
// font-size variables wholesale (no stale variables survive), values render as
// px strings, and dispose retracts everything the presenter wrote, sparing
// foreign inline styles.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_FONT_VAR, EDITOR_FONT_VAR, FontSizePresenter, SIDEBAR_FONT_VAR,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/font-size-presenter.ts'
import type { FontSettings } from '@deepseek-ai/dsh-client-ui-layout/src/font-settings.ts'

function fonts(overrides: Partial<FontSettings> = {}): FontSettings {
  return { sidebarFontSize: 13, editorFontSize: 13, chatFontSize: 16, ...overrides }
}

beforeEach(() => {
  document.body.removeAttribute('style')
})

afterEach(() => {
  document.body.removeAttribute('style')
})

describe('FontSizePresenter', () => {
  it('applies the three workbench font sizes as px body variables', () => {
    const presenter = new FontSizePresenter()
    presenter.apply(fonts({ sidebarFontSize: 14, editorFontSize: 15, chatFontSize: 17 }))
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('14px')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('15px')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('17px')
  })

  it('replaces the previous set on a second apply without merging', () => {
    const presenter = new FontSizePresenter()
    presenter.apply(fonts({ sidebarFontSize: 14, editorFontSize: 15, chatFontSize: 17 }))
    presenter.apply(fonts({ sidebarFontSize: 12, chatFontSize: 12 }))
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('12px')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('13px')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('12px')
  })

  it('dispose retracts every applied variable, sparing foreign inline styles', () => {
    document.body.style.setProperty('--foreign', 'kept')
    const presenter = new FontSizePresenter()
    presenter.apply(fonts())
    presenter.dispose()
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue('--foreign')).toBe('kept')
  })
})
