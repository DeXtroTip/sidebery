import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import * as T from 'src/types'
import * as D from 'src/defaults'
import * as Tabs from 'src/services/tabs.fg'
import * as IPC from 'src/services/ipc'
import * as Windows from 'src/services/windows.fg'
import { resetMSidebar, addMPanel } from 'src/defaults/mocks.sidebar.fg'
import { MTab, resetMTabs } from 'src/defaults/mocks.tabs.fg'
import { EventTargetMock } from 'src/services/tabs.fg.test.helpers'

const moveSpy = vi.fn(() => Promise.resolve())
const setTabValueSpy = vi.fn(() => Promise.resolve())
let nativeTabs: T.NativeTab[] = []
function nativeTab(overrides: Partial<T.NativeTab>): T.NativeTab {
  const tab = {
    id: 1,
    index: 0,
    windowId: Windows.id,
    active: false,
    pinned: false,
    status: 'complete',
    title: '',
    url: 'about:newtab',
    cookieStoreId: D.DEFAULT_CONTAINER_ID,
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) Reflect.set(tab, key, value)
  }
  return tab as unknown as T.NativeTab
}
function setupBrowserMocks(): void {
  const b = globalThis.browser as typeof browser
  b.tabs = {
    ...b.tabs,
    query: vi.fn((info?: { windowId?: ID }) =>
      info?.windowId === undefined
        ? Promise.resolve(nativeTabs)
        : Promise.resolve(nativeTabs.filter(t => t.windowId === info.windowId))
    ),
    move: moveSpy,
    get: vi.fn((id: ID) => Promise.resolve(nativeTabs.find(t => t.id === id))),
    update: vi.fn(() => Promise.resolve({})),
    discard: vi.fn(() => Promise.resolve({})),
    reload: vi.fn(() => Promise.resolve({})),
    highlight: vi.fn(() => Promise.resolve({})),
    onCreated: new EventTargetMock<[T.NativeTab]>(),
    onUpdated: new EventTargetMock(),
    onRemoved: new EventTargetMock(),
    onMoved: new EventTargetMock<[ID, browser.tabs.MoveInfo]>(),
    onDetached: new EventTargetMock(),
    onAttached: new EventTargetMock(),
    onActivated: new EventTargetMock(),
    onReplaced: new EventTargetMock(),
  } as unknown as typeof browser.tabs
  b.sessions = {
    ...b.sessions,
    setTabValue: setTabValueSpy,
    getTabValue: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as typeof browser.sessions
}
function buildCache(tabs: T.Tab[]): Record<ID, T.TabCache> {
  const cache: Record<ID, T.TabCache> = {}
  for (const tab of tabs) {
    const info: T.TabCache = { id: tab.id, url: tab.url }
    if (tab.pinned) info.pin = true
    if (+tab.parentId > -1) info.parentId = tab.parentId
    if (tab.panelId !== D.NOID) info.panelId = tab.panelId
    if (tab.folded) info.folded = tab.folded
    if (tab.cookieStoreId !== D.CONTAINER_ID) info.ctx = tab.cookieStoreId
    cache[tab.id] = info
  }
  return cache
}
function setStorageCache(winCaches: Record<ID, T.TabCache>[]): void {
  void browser.storage.local.set({ tabsDataCache: winCaches.map(c => Object.values(c)) })
}
interface PreCloseTabDef {
  id: ID
  url: string
  parentId?: ID
  panelId?: ID
  pinned?: boolean
  cookieStoreId?: string
}
function makeFgTabs(defs: PreCloseTabDef[], panelIds: ID[]): T.Tab[] {
  return defs.map((def, index) => {
    const tab = new MTab({
      id: def.id,
      index,
      url: def.url,
      title: def.url,
      active: index === 0,
      pinned: def.pinned,
      parentId: def.parentId,
      panelId: def.panelId ?? panelIds[0],
      lvl: def.parentId ? 1 : 0,
      cookieStoreId: def.cookieStoreId,
      windowId: Windows.id,
      isParent: !!def.parentId,
    })
    tab.index = index
    return tab
  })
}
describe('sidebar close/reopen keeps tabs unchanged', () => {
  let panelIds: ID[]
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetMSidebar()
    resetMTabs()
    setupBrowserMocks()
    Windows.setCurrentId(1)
    addMPanel({ id: 'p1' })
    addMPanel({ id: 'p2' })
    panelIds = ['p1', 'p2']
  })
  afterEach(() => {
    Tabs.cancelCachingTabsData()
    vi.useRealTimers()
    vi.restoreAllMocks()
    nativeTabs = []
    resetMTabs()
    resetMSidebar()
  })
  test('reopen with unchanged native tabs is identity', async () => {
    const defs: PreCloseTabDef[] = [
      { id: 10, url: 'https://a.example/', panelId: 'p1' },
      { id: 11, url: 'https://b.example/', parentId: 10, panelId: 'p1' },
      { id: 12, url: 'https://c.example/', panelId: 'p2' },
    ]
    const fgTabs = makeFgTabs(defs, panelIds)
    setStorageCache([buildCache(fgTabs)])
    nativeTabs = defs.map((def, i) =>
      nativeTab({ id: def.id, index: i, url: def.url, pinned: def.pinned })
    )
    await Tabs.load()
    expect(moveSpy).not.toHaveBeenCalled()
    expect(Tabs.list.map(t => t.id)).toEqual([10, 11, 12])
    expect(Tabs.byId[11]?.parentId).toBe(10)
  })
  test('pagehide persists the latest tab cache immediately', async () => {
    const defs: PreCloseTabDef[] = [{ id: 10, url: 'https://a.example/', panelId: 'p1' }]
    const fgTabs = makeFgTabs(defs, panelIds)
    nativeTabs = defs.map((def, i) => nativeTab({ id: def.id, index: i, url: def.url }))
    setStorageCache([buildCache(fgTabs)])
    const cacheSpy = vi
      .spyOn(IPC, 'bg')
      .mockImplementation(() => Promise.resolve(undefined) as never)

    await Tabs.load()
    cacheSpy.mockClear()
    const movedTab = Tabs.byId[10]
    if (!movedTab) throw new Error('Expected tab 10 to be loaded')
    movedTab.panelId = 'p2'
    Tabs.cacheTabsData(1000)

    window.dispatchEvent(new Event('pagehide'))

    expect(cacheSpy).toHaveBeenCalledWith(
      'cacheTabsData',
      1,
      [{ id: 10, url: 'https://a.example/', panelId: 'p2', uniqWinId: -1 }],
      0
    )
    await vi.advanceTimersByTimeAsync(1000)
    expect(cacheSpy).toHaveBeenCalledTimes(1)
  })
  test('duplicate URLs: reopen preserves correct parent despite same URL repeats', async () => {
    const storedDefs: PreCloseTabDef[] = [
      { id: 10, url: 'https://a.example/', panelId: 'p1' },
      { id: 11, url: 'https://a.example/', parentId: 10, panelId: 'p1' },
      { id: 12, url: 'https://c.example/', panelId: 'p2' },
    ]
    const fgTabs = makeFgTabs(storedDefs, panelIds)
    setStorageCache([buildCache(fgTabs)])
    nativeTabs = storedDefs.map((def, i) =>
      nativeTab({ id: def.id, index: i, url: def.url, pinned: def.pinned })
    )
    await Tabs.load()
    expect(Tabs.byId[11]?.parentId).toBe(10)
    expect(Tabs.list.map(t => t.id)).toEqual([10, 11, 12])
    expect(moveSpy).not.toHaveBeenCalled()
  })
  test('tmp container new tabs while sidebar closed land in correct panel', async () => {
    const storedDefs: PreCloseTabDef[] = [
      { id: 10, url: 'https://a.example/', panelId: 'p1' },
      { id: 11, url: 'https://b.example/', parentId: 10, panelId: 'p1' },
    ]
    const fgTabs = makeFgTabs(storedDefs, panelIds)
    setStorageCache([buildCache(fgTabs)])
    nativeTabs = [
      nativeTab({ id: 10, index: 0, url: 'https://a.example/' }),
      nativeTab({ id: 11, index: 1, url: 'https://b.example/' }),
      nativeTab({
        id: 20,
        index: 2,
        url: 'https://new1.example/',
        cookieStoreId: 'firefox-container-tmp10',
      }),
      nativeTab({
        id: 21,
        index: 3,
        url: 'https://new2.example/',
        cookieStoreId: 'firefox-container-tmp11',
      }),
    ]
    await Tabs.load()
    expect(Tabs.byId[10]?.panelId).toBe('p1')
    expect(Tabs.byId[11]?.parentId).toBe(10)
    expect(Tabs.list.length).toBe(4)
    expect(Tabs.list.slice(0, 2).map(t => t.id)).toEqual([10, 11])
  })
  test('unrelated same-index replacement does not inherit cached tree state', async () => {
    const storedDefs: PreCloseTabDef[] = [
      { id: 10, url: 'https://a.example/', panelId: 'p2' },
      { id: 11, url: 'https://b.example/', parentId: 10, panelId: 'p2' },
      { id: 12, url: 'https://c.example/', panelId: 'p1' },
    ]
    const fgTabs = makeFgTabs(storedDefs, panelIds)
    setStorageCache([buildCache(fgTabs)])
    nativeTabs = [
      nativeTab({ id: 20, index: 0, url: 'https://unrelated.example/' }),
      nativeTab({ id: 11, index: 1, url: 'https://b.example/' }),
      nativeTab({ id: 12, index: 2, url: 'https://c.example/' }),
    ]

    await Tabs.load()

    expect(Tabs.byId[20]?.parentId).toBe(D.NOID)
    expect(Tabs.byId[20]?.panelId).not.toBe('p2')
  })
})
