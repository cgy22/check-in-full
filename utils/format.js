// utils/format.js
export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function timeLeftText(value) {
  if (!value) return '—'
  const ms = new Date(value).getTime() - Date.now()
  if (Number.isNaN(ms)) return '—'
  if (ms <= 0) return '已过期'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `${days} 天后过期`
  const hours = Math.floor(ms / 3600000)
  if (hours >= 1) return `${hours} 小时后过期`
  const mins = Math.max(1, Math.floor(ms / 60000))
  return `${mins} 分钟后过期`
}
