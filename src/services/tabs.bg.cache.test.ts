import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as T from 'src/types'
import * as BgTabs from 'src/services/tabs.bg'
import * as Store from 'src/services/storage.bg'

const cache: T.TabCache[] = [{ id: 10, url: 'https://example.com/', panelId: 'p1' }]

describe('background tab cache persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    BgTabs.flushCacheTabsData()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('writes a zero-delay cache immediately', () => {
    const setSpy = vi.spyOn(Store, 'set').mockResolvedValue()

    BgTabs.cacheTabsData(1, cache, 0)

    expect(setSpy).toHaveBeenCalledWith({ tabsDataCache: [cache] })
  })

  test('flushes a pending cache and cancels its timer', async () => {
    const setSpy = vi.spyOn(Store, 'set').mockResolvedValue()

    BgTabs.cacheTabsData(1, cache, 1000)
    BgTabs.flushCacheTabsData()
    await vi.advanceTimersByTimeAsync(1000)

    expect(setSpy).toHaveBeenCalledTimes(1)
    expect(setSpy).toHaveBeenCalledWith({ tabsDataCache: [cache] })
  })
})
