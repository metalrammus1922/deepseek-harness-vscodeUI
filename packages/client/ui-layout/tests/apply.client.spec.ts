// @vitest-environment jsdom
// Client apply wiring under the terminal register form: ctx.layout provided,
// ONE register() call declares the three child slots + seats the store factory
// + wires the panel actions through the inject hook; teardown cascades
// (service unprovided + declarations gone + registration cleared). Node half
// and the invariant companion ride along — one line exposes the aggregate
// coverage gate still requires exercised.

import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { SettingsProvider, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as themeApply, inject as themeInject, ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject, LayoutController } from '@deepseek-ai/dsh-client-ui-layout/client'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-layout'
import {
  DEFAULT_CHAT_FONT_SIZE, DEFAULT_EDITOR_FONT_SIZE, DEFAULT_SIDEBAR_FONT_SIZE,
  FONT_SETTINGS_NAMESPACE,
} from '@deepseek-ai/dsh-client-ui-layout'
import {
  CHAT_FONT_VAR, EDITOR_FONT_VAR, SIDEBAR_FONT_VAR,
} from '../src/client/font-size-presenter.ts'
import * as invariant from '@deepseek-ai/dsh-client-ui-layout/invariant'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

beforeEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => { node.remove() })
})

async function bench() {
  const ctx = new Context()
  const slotsFiber = ctx.plugin(SlotRegistry)
  // Theme registers its Appearance settings row and requires the connection
  // seam for persistence; model this bench as a remote, memory-only browser.
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  // ui-theme's Appearance row binds a durable scope through these two.
  ctx.provide('remote', { $on: () => () => {} } as never)
  // The font-size presenter binds its own namespace scope; the stub is
  // namespace-routed so a font acceptance never reaches theme's scope (theme
  // adopts any published value as a ThemeSettings section).
  const settingsStub = stubSettingsScope<{
    sidebarFontSize: number
    editorFontSize: number
    chatFontSize: number
  }>()
  ctx.provide('settingsScope', {
    bind: (spec: { namespace: string }) => spec.namespace === FONT_SETTINGS_NAMESPACE
      ? settingsStub.scope
      : stubSettingsScope().scope,
  } as never)
  await ctx.plugin({ inject: themeInject, apply: themeApply }).await()
  await slotsFiber.await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, settingsStub }
}

describe('ui-layout client apply', () => {
  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'theme', 'connection', 'remote', 'settingsScope'])
  })

  it('provides ctx.layout and registers AppFrame into root with the three child declarations', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.get('layout')).toBeInstanceOf(LayoutController)
    // The one register() call occupied 'root'…
    expect(slots.entries('root')).toHaveLength(1)
    // …and declared the three children in the ledger.
    expect(slots.spec('sidebar')).toEqual({ kind: 'single', scope: 'root' })
    expect(slots.spec('conversation')).toEqual({ kind: 'single', scope: 'session-maybe' })
    expect(slots.spec('details')).toEqual({ kind: 'single', scope: 'session' })
  })

  it('injects no business face and attaches the layout actions', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const actions = {
      setSidebar: vi.fn(), setDetails: vi.fn(), toggleSidebar: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn(),
    }
    const injected = (slots.entries('root')[0]!.inject as (actions: never) => object)(actions as never)
    expect(injected).toEqual({})
    const layout = ctx.get('layout') as LayoutController
    layout.toggleSidebar()
    expect(actions.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('theme presenter applies the initial snapshot, follows theme/change, and unwinds on dispose', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // Initial getter application: the fork defaults to dark regardless of matchMedia.
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    const themeColorMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    expect(themeColorMeta).not.toBeNull()
    const theme = ctx.get('theme') as ThemeRuntime
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect(document.head.querySelector('meta[name="theme-color"]')).toBe(themeColorMeta)
    await fiber.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(themeColorMeta?.isConnected).toBe(false)
    // Listener is off: further theme changes no longer reach the document.
    theme.setTheme('light')
    theme.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
  })

  it('font-size presenter applies the settings section to body variables and unwinds on dispose', async () => {
    const { ctx, settingsStub } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    // Loading snapshot: nothing projected yet.
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('')
    // Host acceptance projects the three variables.
    settingsStub.publish({
      status: 'ready',
      value: { sidebarFontSize: 14, editorFontSize: 15, chatFontSize: 17 },
    })
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('14px')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('15px')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('17px')
    // A later acceptance replaces the whole set (no stale variables).
    settingsStub.publish({
      status: 'ready',
      value: { sidebarFontSize: 12, editorFontSize: 12, chatFontSize: 12 },
    })
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('12px')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('12px')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('12px')
    await fiber.dispose()
    expect(document.body.style.getPropertyValue(SIDEBAR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(EDITOR_FONT_VAR)).toBe('')
    expect(document.body.style.getPropertyValue(CHAT_FONT_VAR)).toBe('')
  })

  it('teardown unwinds the service, the root registration, and the child declarations', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await fiber.dispose()
    expect(ctx.get('layout')).toBeUndefined()
    expect(slots.entries('root')).toHaveLength(0)
    expect(slots.spec('sidebar')).toBeUndefined()
    // The built-in root declaration survives entry teardown (runtime-owned).
    expect(slots.spec('root')).toEqual({ kind: 'single', scope: 'root' })
  })
})

describe('node half + invariant companion', () => {
  it('node apply registers the durable font-size namespace when settings exist', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply: nodeApply })
    await fiber.await()
    const ns = settingsNamespace(FONT_SETTINGS_NAMESPACE)
    expect(ctx.settings.get(ns)).toEqual({
      sidebarFontSize: DEFAULT_SIDEBAR_FONT_SIZE,
      editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
      chatFontSize: DEFAULT_CHAT_FONT_SIZE,
    })
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('invariant companion registers under the package name', async () => {
    const register = vi.fn().mockReturnValue(() => {})
    const ctx = { invariants: { register } } as never
    // The /invariant subpath types live in lib/types (build product); assert
    // the API so the call stays typed where lint runs without a build.
    const dispose = await (invariant as { apply: (ctx: never) => Promise<() => void> }).apply(ctx)
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-client-ui-layout', expect.any(Function))
    // The installer is the declared no-op — calling it must not throw.
    expect(() => { (register.mock.calls[0]![1] as (c: never) => void)(undefined as never) }).not.toThrow()
    expect(dispose).toBeTypeOf('function')
  })
})
