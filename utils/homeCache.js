// utils/homeCache.js
// 首页签到数据的内存缓存：一次 App 启动只自动拉取一次。
// tab 切换/筛选只在本地过滤，下拉才刷新。
let cache = {
  active: [],
  upcoming: [],
  ended: []
}
let loaded = false
let loadedAt = 0

export function hasHomeCache() {
  return loaded
}

export function getHomeCache() {
  return cache
}

export function setHomeCache(next) {
  cache = {
    active: (next && next.active) || [],
    upcoming: (next && next.upcoming) || [],
    ended: (next && next.ended) || []
  }
  loaded = true
  loadedAt = Date.now()
}

export function patchHomeCacheEvent(eventId, patch) {
  if (!eventId || !patch) return
  let found = null
  for (const key of ['active', 'upcoming', 'ended']) {
    const next = []
    for (const item of cache[key]) {
      if (item.id === eventId) found = { ...item, ...patch }
      else next.push(item)
    }
    cache[key] = next
  }
  if (!found) return
  const target = found.status || 'ended'
  if (cache[target]) {
    cache[target].push(found)
    cache[target].sort((a, b) => {
      if (target === 'upcoming') return new Date(a.start_at) - new Date(b.start_at)
      if (target === 'active') return new Date(a.end_at) - new Date(b.end_at)
      return new Date(b.start_at) - new Date(a.start_at)
    })
  }
  loaded = true
}

export function getHomeLoadedAt() {
  return loadedAt
}

export function resetHomeCache() {
  cache = { active: [], upcoming: [], ended: [] }
  loaded = false
  loadedAt = 0
}
