import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import * as T from 'src/types'
import * as D from 'src/defaults'
import * as Tabs from 'src/services/tabs.fg'
import * as Windows from 'src/services/windows.fg'
import * as Popups from 'src/services/popups.fg'
import { resetMSidebar, addMPanel } from 'src/defaults/mocks.sidebar.fg'
import { MTab, resetMTabs } from 'src/defaults/mocks.tabs.fg'
import * as Handlers from 'src/services/tabs.fg.handlers'
import { EventTargetMock } from 'src/services/tabs.fg.test.helpers'

type OnCreatedMock = EventTargetMock<[T.NativeTab]>
let onCreatedMock: OnCreatedMock

describe('middle-click double open triggers false session restore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    onCreatedMock = new EventTargetMock<[T.NativeTab]>()
    resetMSidebar()
    resetMTabs()
    Windows.setCurrentId(1)
    addMPanel({ id: 'p1' })
    addMPanel({ id: 'p2' })
    const b = globalThis.browser as typeof browser
    b.tabs = {
      ...b.tabs,
      query: vi.fn(() => Promise.resolve([])),
      get: vi.fn(() => Promise.resolve({})),
      create: vi.fn(() => Promise.resolve({})),
      update: vi.fn(() => Promise.resolve({})),
      move: vi.fn(() => Promise.resolve({})),
      moveInSuccession: vi.fn(() => Promise.resolve([])),
      discard: vi.fn(() => Promise.resolve({})),
      reload: vi.fn(() => Promise.resolve({})),
      highlight: vi.fn(() => Promise.resolve({})),
      captureTab: vi.fn(() => Promise.resolve('')),
      onCreated: onCreatedMock,
      onUpdated: new EventTargetMock(),
      onRemoved: new EventTargetMock(),
      onMoved: new EventTargetMock(),
      onDetached: new EventTargetMock(),
      onAttached: new EventTargetMock(),
      onActivated: new EventTargetMock(),
      onReplaced: new EventTargetMock(),
    } as unknown as typeof browser.tabs
    b.sessions = {
      ...b.sessions,
      getTabValue: vi.fn(() => Promise.resolve(undefined)),
      setTabValue: vi.fn(() => Promise.resolve()),
      getWindowValue: vi.fn(() => Promise.resolve(undefined)),
      setWindowValue: vi.fn(() => Promise.resolve()),
    } as unknown as typeof browser.sessions
    b.windows = {
      ...b.windows,
      getCurrent: vi.fn(() =>
        Promise.resolve({ id: 1, incognito: false, focused: true, type: 'normal' })
      ),
      getAll: vi.fn(() => Promise.resolve([])),
    } as unknown as typeof browser.windows
    Tabs.setList([])
    Object.defineProperty(Tabs, 'ready', { value: true, writable: true, configurable: true })
    vi.spyOn(Popups, 'openProcessingTabsPopup').mockImplementation(() => {})
    vi.spyOn(Popups, 'closeProcessingTabsPopup').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetMTabs()
    resetMSidebar()
  })

  test('two rapid middle-clicks should NOT trigger Processing tabs popup', async () => {
    const hckrTab = new MTab({
      id: 10,
      index: 0,
      windowId: 1,
      url: 'https://hckrnews.com/',
      title: 'hckrnews',
      active: true,
      parentId: D.NOID,
      panelId: 'p1',
      cookieStoreId: D.DEFAULT_CONTAINER_ID,
      status: 'complete',
      isParent: false,
    })
    Tabs.list.push(hckrTab)
    Tabs.byId[10] = hckrTab
    Tabs.setActiveId(10)

    const getTabValueSpy = vi.spyOn(browser.sessions, 'getTabValue')
    getTabValueSpy.mockImplementation(() => Promise.resolve(undefined))

    const openSpy = vi.spyOn(Popups, 'openProcessingTabsPopup')

    Handlers.setupTabsListeners()
    const onCreated = onCreatedMock.getListener()
    expect(onCreated).toBeDefined()

    const nativeTab1: T.NativeTab = {
      id: 11,
      index: 1,
      windowId: 1,
      url: 'https://example.com/a',
      title: 'A',
      active: false,
      pinned: false,
      discarded: true,
      status: 'unloaded',
      cookieStoreId: D.DEFAULT_CONTAINER_ID,
      openerTabId: 10,
    } as unknown as T.NativeTab

    const nativeTab2: T.NativeTab = {
      id: 12,
      index: 2,
      windowId: 1,
      url: 'https://example.com/b',
      title: 'B',
      active: false,
      pinned: false,
      discarded: true,
      status: 'unloaded',
      cookieStoreId: D.DEFAULT_CONTAINER_ID,
      openerTabId: 10,
    } as unknown as T.NativeTab

    if (!onCreated) throw new Error('Expected onCreated listener')
    await onCreated(nativeTab1)
    await vi.advanceTimersByTimeAsync(50)
    await onCreated(nativeTab2)
    await vi.advanceTimersByTimeAsync(400)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(100)

    expect(openSpy).not.toHaveBeenCalled()
  })
})
