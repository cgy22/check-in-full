// utils/constants.js
export const MAJORS = [
  { code: '01', name: '语言学' },
  { code: '02', name: '𣿅语语言文学' },
  { code: '03', name: '外国语言文学' },
  { code: '04', name: '历史学' },
  { code: '05', name: '哲学' },
  { code: '06', name: '翻译学' },
  { code: '07', name: '新闻传播学' },
  { code: '08', name: '计算机科学与技术' },
  { code: '09', name: '经济学' },
  { code: '10', name: '法学' },
  { code: '11', name: '数学与应用数学' },
  { code: '12', name: '物理学' }
]

export const ENROLLMENT_YEARS = Array.from(
  { length: 13 },
  (_, i) => new Date().getFullYear() - 6 + i
)

export const INVITE_VALIDITY_OPTIONS = [
  { label: '1 小时', seconds: 3600 },
  { label: '24 小时', seconds: 86400 },
  { label: '7 天', seconds: 604800 },
  { label: '30 天', seconds: 2592000 }
]

export const CHECKIN_TABS = [
  { key: 'active', label: '正在签到' },
  { key: 'upcoming', label: '未开始' },
  { key: 'ended', label: '已结束' }
]

export const ENDED_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'present', label: '已签到' },
  { key: 'absent', label: '未签到' }
]

export const DEFAULT_AVATAR_TEXT = '瓦'
