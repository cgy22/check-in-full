// utils/time.js
// 时区转换：把“某时区的墙上时间”转成 UTC Date。
// 依赖 Intl；H5/Android WebView 均支持。若极端环境不支持，回退到设备本地时间。

export const COMMON_TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC'
]

let nativeTimeZoneResolved = false

export function getDeviceTimeZone() {
  // App 的 WebView/JS 引擎可能缓存了启动时的时区，或 Intl 缺少完整 IANA 数据。
  // 优先读取 Android/iOS 原生系统时区，保证用户改手机时区后显示正确。
  try {
    if (typeof plus !== 'undefined') {
      if (plus.android) {
        const TimeZone = plus.android.importClass('java.util.TimeZone')
        const id = TimeZone.getDefault().getID()
        if (id) {
          nativeTimeZoneResolved = true
          return String(id)
        }
      }
      if (plus.ios) {
        const NSTimeZone = plus.ios.importClass('NSTimeZone')
        const zone = NSTimeZone.localTimeZone()
        const name = zone && zone.name ? zone.name() : ''
        if (name) {
          nativeTimeZoneResolved = true
          return String(name)
        }
      }
    }
  } catch (e) {}

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz || 'Asia/Shanghai'
  } catch (e) {
    return 'Asia/Shanghai'
  }
}

export function getTimeZoneOptions() {
  const device = getDeviceTimeZone()
  const set = new Set([device, ...COMMON_TIMEZONES])
  return Array.from(set)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function partsInZone(date, zone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })
  const map = {}
  fmt.formatToParts(date).forEach(p => {
    if (p.type !== 'literal') map[p.type] = p.value
  })
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

function offsetMs(date, zone) {
  const p = partsInZone(date, zone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - date.getTime() + (date.getMilliseconds ? date.getMilliseconds() : 0)
}

// dateStr: YYYY-MM-DD, timeStr: HH:mm, zone: IANA
export function zonedTimeToUtc(dateStr, timeStr, zone) {
  const d = String(dateStr || '').split('-').map(Number)
  const t = String(timeStr || '').split(':').map(Number)
  if (d.length !== 3 || t.length < 2) return null
  const [year, month, day] = d
  const [hour, minute] = t
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null

  try {
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0)
    let offset = offsetMs(new Date(desired), zone)
    let utc = desired - offset
    // 再迭代一次，处理 DST 切换边界
    offset = offsetMs(new Date(utc), zone)
    utc = desired - offset
    return new Date(utc)
  } catch (e) {
    // 回退：按设备本地时间
    return new Date(year, month - 1, day, hour, minute, 0)
  }
}

export function formatInZone(value, zone, withDate = true) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  try {
    const p = partsInZone(date, zone)
    if (!withDate) return `${pad(p.hour)}:${pad(p.minute)}`
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
  } catch (e) {
    // Android WebView 可能没有完整 ICU / 不支持某个 IANA 时区；
    // 回退到设备本地时间，避免首页时间显示成横杠。
    return fallbackLocal(date, withDate)
  }
}

function fallbackLocal(date, withDate = true) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—'
  if (!withDate) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

function canFormatInZone(zone, date) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(date)
    return true
  } catch (e) {
    return false
  }
}

function formatWithOffset(date, offsetMinutes, withDate = true) {
  const shifted = new Date(date.getTime() - Number(offsetMinutes) * 60 * 1000)
  const p = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  }
  if (!withDate) return `${pad(p.hour)}:${pad(p.minute)}`
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

export function formatDeviceDateTime(value, withDate = true) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const zone = getDeviceTimeZone()

  // App 原生时区最可靠；Intl 支持该 IANA 时区时优先使用。
  if (nativeTimeZoneResolved && canFormatInZone(zone, date)) {
    return formatInZone(date, zone, withDate)
  }

  // 没有原生时区时，使用系统信息里的分钟偏移。
  try {
    const info = uni.getSystemInfoSync()
    const offset = Number(info && info.timezoneOffset)
    if (Number.isFinite(offset)) {
      return formatWithOffset(date, offset, withDate)
    }
  } catch (e) {}

  return formatInZone(date, zone, withDate)
}

export function dateInputInZone(value, zone) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const p = partsInZone(date, zone)
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`
  } catch (e) {
    return ''
  }
}

export function timeInputInZone(value, zone) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const p = partsInZone(date, zone)
    return `${pad(p.hour)}:${pad(p.minute)}`
  } catch (e) {
    return ''
  }
}

export function addMinutes(value, minutes) {
  return new Date(new Date(value).getTime() + minutes * 60 * 1000)
}
