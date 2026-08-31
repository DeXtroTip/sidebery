import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as T from 'src/types'
import * as Tabs from 'src/services/tabs.fg'
import * as Windows from 'src/services/windows.fg'
import * as Handlers from 'src/services/tabs.fg.handlers'
import { addMPanel, resetMSidebar } from 'src/defaults/mocks.sidebar.fg'
import { MTab, resetMTabs } from 'src/defaults/mocks.tabs.fg'
import { EventTargetMock } from 'src/services/tabs.fg.test.helpers'

let onMovedMock: EventTargetMock<[ID, browser.tabs.MoveInfo]>

describe('out-of-sync tab move handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    onMovedMock = new EventTargetMock<[ID, browser.tabs.MoveInfo]>()
    resetMSidebar()
    resetMTabs()
    Windows.setCurrentId(1)
    addMPanel({ id: 'p1' })
    addMPanel({ id: 'p2' })
    configureBrowserTabs()
    Object.defineProperty(Tabs, 'ready', { value: true, writable: true, configurable: true })
  })

  afterEach(() => {
    Tabs.cancelCachingTabsData()
    vi.useRealTimers()
    vi.restoreAllMocks()
    resetMTabs()
    resetMSidebar()
  })

  test('ignores a move when the destination is missing locally', () => {
    const tab = new MTab({ id: 10, index: 0, panelId: 'p1' })
    setTabsForMove([tab])
    const onMoved = getOnMovedListener()

    expect(() => onMoved(10, { windowId: 1, fromIndex: 0, toIndex: 2 })).not.toThrow()
    expect(Tabs.list).toEqual([tab])
  })

  test('uses the tab id when the source index is stale', () => {
    const staleTab = new MTab({ id: 11, index: 0, panelId: 'p1' })
    const movedTab = new MTab({ id: 10, index: 1, panelId: 'p1' })
    const destinationTab = new MTab({ id: 12, index: 2, panelId: 'p1' })
    setTabsForMove([staleTab, movedTab, destinationTab])
    const onMoved = getOnMovedListener()

    onMoved(10, { windowId: 1, fromIndex: 0, toIndex: 2 })

    expect(Tabs.list.map(tab => tab.id)).toEqual([11, 12, 10])
  })
})

function configureBrowserTabs(): void {
  const browserMock = globalThis.browser as typeof browser
  browserMock.tabs = {
    ...browserMock.tabs,
    onCreated: new EventTargetMock(),
    onUpdated: new EventTargetMock(),
    onRemoved: new EventTargetMock(),
    onMoved: onMovedMock,
    onDetached: new EventTargetMock(),
    onAttached: new EventTargetMock(),
    onActivated: new EventTargetMock(),
    onReplaced: new EventTargetMock(),
  } as unknown as typeof browser.tabs
  browserMock.sessions = {
    ...browserMock.sessions,
    setTabValue: vi.fn(() => Promise.resolve()),
    getTabValue: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as typeof browser.sessions
}

function setTabsForMove(tabs: T.Tab[]): void {
  Tabs.setList(tabs)
  Tabs.setById(Object.fromEntries(tabs.map(tab => [tab.id, tab])))
  Tabs.setMovingTabs([])
  Handlers.setupTabsListeners()
}

function getOnMovedListener(): (id: ID, info: browser.tabs.MoveInfo) => unknown {
  const listener = onMovedMock.getListener()
  if (!listener) throw new Error('Expected onMoved listener')
  return listener
}
