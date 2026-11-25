// utils/session.js
const STORAGE_KEY = 'vu_session_unicloud_v1'

export function normalizeSession(data) {
  if (!data || !data.access_token) return null
  const expiresIn = Number(data.expires_in || 3600)
  const expiresAt =
    data.expires_at != null
      ? Number(data.expires_at) * 1000
      : Date.now() + expiresIn * 1000
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: data.token_type || 'bearer',
    user: data.user || null
  }
}

export function loadSession() {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (!raw) return null
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!s || !s.access_token) return null
    return s
  } catch (e) {
    return null
  }
}

export function saveSession(session) {
  try {
    uni.setStorageSync(STORAGE_KEY, session)
  } catch (e) {}
}

export function clearSession() {
  try {
    uni.removeStorageSync(STORAGE_KEY)
  } catch (e) {}
}

export function isSessionExpired(session, skewMs = 60000) {
  if (!session || !session.expires_at) return true
  return Number(session.expires_at) <= Date.now() + skewMs
}

const LAST_STUDENT_ID_KEY = 'vu_last_student_id'

export function saveLastStudentId(studentId) {
  try {
    uni.setStorageSync(LAST_STUDENT_ID_KEY, String(studentId || ''))
  } catch (e) {}
}

export function loadLastStudentId() {
  try {
    return String(uni.getStorageSync(LAST_STUDENT_ID_KEY) || '')
  } catch (e) {
    return ''
  }
}

export function clearLastStudentId() {
  try {
    uni.removeStorageSync(LAST_STUDENT_ID_KEY)
  } catch (e) {}
}
