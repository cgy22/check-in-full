import { computed, ref } from 'vue'
import { getMyProfile, makeError, rpc } from '../utils/authApi'
import {
  loadSession,
  saveSession,
  clearSession,
  normalizeSession,
  isSessionExpired,
  saveLastStudentId,
  clearLastStudentId
} from '../utils/session'
import { normalizeStudentId, isValidStudentId, isValidName, isValidPassword } from '../utils/validators'
import { resetHomeCache } from '../utils/homeCache'

const session = ref(null)
const profile = ref(null)
const ready = ref(false)
const busy = ref(false)
const authError = ref('')
let initPromise
let refreshPromise

function applySession(raw) {
  const normalized = normalizeSession(raw)
  if (!normalized) throw makeError('NO_SESSION', '登录未返回会话')
  session.value = normalized
  saveSession(normalized)
  return normalized
}

function resetSession() {
  session.value = null
  profile.value = null
  clearSession()
  resetHomeCache()
}

async function ensureAccessToken() {
  const oldSession = session.value
  if (!oldSession) throw makeError('UNAUTHORIZED', '请先登录')
  if (!isSessionExpired(oldSession)) return oldSession.access_token
  if (!refreshPromise) {
    refreshPromise = rpc('refresh_session', { refreshToken: oldSession.refresh_token })
      .then(data => {
        if (session.value?.refresh_token !== oldSession.refresh_token) {
          throw makeError('UNAUTHORIZED', '请重新登录')
        }
        return applySession(data).access_token
      })
      .catch(error => {
        if (error.code === 'UNAUTHORIZED' && session.value?.refresh_token === oldSession.refresh_token) {
          resetSession()
          uni.reLaunch({ url: '/pages/auth/login' })
        }
        throw error
      })
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function fetchProfile() {
  if (!session.value) return null
  const token = await ensureAccessToken()
  const data = await getMyProfile(token)
  if (session.value?.access_token === token) profile.value = data
  return data
}

function restore() {
  if (!initPromise) {
    initPromise = (async () => {
      authError.value = ''
      session.value = loadSession()
      try {
        if (session.value) await fetchProfile()
      } catch (error) {
        if (error.code === 'UNAUTHORIZED') resetSession()
        else authError.value = error.message
      } finally {
        ready.value = true
      }
    })()
  }
  return initPromise
}

function acceptLogin(result) {
  applySession(result.session)
  profile.value = result.profile
  saveLastStudentId(result.profile.student_id)
  resetHomeCache()
}

async function login(studentIdRaw, password, captchaToken) {
  const studentId = normalizeStudentId(studentIdRaw)
  if (!isValidStudentId(studentId)) throw makeError('INVALID_STUDENT_ID', '请输入 12 位学号')
  if (!isValidPassword(password)) {
    throw makeError('INVALID_PASSWORD', '密码至少 8 位且同时包含字母和数字')
  }
  busy.value = true
  try {
    const result = await rpc('login_account', { studentId, password, captchaToken })
    acceptLogin(result)
    return result.profile
  } finally {
    busy.value = false
  }
}

async function register(form, captchaToken) {
  const fullName = String(form.fullName || '').trim()
  if (!isValidName(fullName)) throw makeError('INVALID_NAME', '姓名需为 2-50 个字符')
  if (!isValidPassword(form.password)) {
    throw makeError('INVALID_PASSWORD', '密码至少 8 位且同时包含字母和数字')
  }
  if (form.password !== form.confirmPassword) throw makeError('PASSWORD_MISMATCH', '两次输入的密码不一致')
  busy.value = true
  try {
    const result = await rpc('register_account', {
      full_name: fullName,
      enrollment_year: Number(form.enrollmentYear),
      major_code: form.majorCode,
      password: form.password,
      captchaToken
    })
    acceptLogin(result)
    return { studentId: result.profile.student_id, profile: result.profile, majorName: result.profile.major_name }
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  try {
    if (session.value) await rpc('logout_account', {}, await ensureAccessToken())
  } catch (_) {
    // 会话仍需在本机清除。
  } finally {
    resetSession()
    initPromise = null
    busy.value = false
    uni.reLaunch({ url: '/pages/auth/login' })
  }
}

async function deleteAccount(studentId, confirmText) {
  busy.value = true
  try {
    await rpc('delete_my_account', {
      p_student_id: String(studentId || ''),
      p_confirm_text: String(confirmText || '')
    }, await ensureAccessToken())
    resetSession()
    clearLastStudentId()
    initPromise = null
    uni.reLaunch({ url: '/pages/auth/login' })
  } finally {
    busy.value = false
  }
}

const isLoggedIn = computed(() => !!session.value)

export function useAuth() {
  return {
    session, profile, ready, busy, authError, isLoggedIn,
    restore, login, register, logout, deleteAccount, ensureAccessToken, fetchProfile
  }
}
