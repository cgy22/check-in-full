// composables/useAuth.js
// 全局单例：session / profile / ready。页面只读这里的状态，不各自复制。
import { computed, ref } from 'vue'
import {
  signUp,
  signInWithPassword,
  refreshSession,
  signOut,
  getLoginSalt,
  getMyProfile,
  rpc
} from '../utils/authApi'
import { sha256Hex, randomHex, randomInt } from '../utils/crypto'
import {
  loadSession,
  saveSession,
  clearSession,
  normalizeSession,
  isSessionExpired,
  saveLastStudentId,
  clearLastStudentId
} from '../utils/session'
import {
  normalizeStudentId,
  isValidStudentId,
  isValidPassword,
  isValidName
} from '../utils/validators'
import { STUDENT_EMAIL_DOMAIN } from '../utils/config'
import { MAJORS } from '../utils/constants'
import { makeError } from '../utils/http'
import { resetHomeCache } from '../utils/homeCache'

const session = ref(null)
const profile = ref(null)
const ready = ref(false)
const busy = ref(false)
const authError = ref('')
let initPromise = null
let profilePromise = null

function emailForStudentId(studentId) {
  return `${studentId}@${STUDENT_EMAIL_DOMAIN}`
}

function majorName(code) {
  const m = MAJORS.find(x => x.code === code)
  return m ? m.name : code
}

function generateStudentId(enrollmentYear, majorCode) {
  const suffix = String(randomInt(1000000)).padStart(6, '0')
  return `${enrollmentYear}${majorCode}${suffix}`
}

function passwordHash(salt, password) {
  return sha256Hex(`${salt}|${password}`)
}

function mapAuthError(err) {
  if (!err) return makeError('UNKNOWN', '操作失败，请稍后重试')
  const msg = String(err.message || '')
  const code = String(err.code || '')
  const status = err.extra && err.extra.statusCode

  if (code === 'BRIDGE_UNAVAILABLE') {
    return makeError(code, '当前设备无法连接服务器，请检查网络后重试')
  }
  if (code === 'NETWORK_ERROR') {
    return makeError(code, '网络请求失败，请检查网络后重试')
  }
  if (/captcha/i.test(code) || /captcha/i.test(msg)) {
    return makeError('CAPTCHA_FAILED', '人机验证失败，请重新验证')
  }
  if (/already registered|already been registered|user already exists/i.test(msg)) {
    return makeError('STUDENT_ID_TAKEN', '学号生成冲突，请重新点击注册再试一次')
  }
  if (/email not confirmed/i.test(msg)) {
    return makeError('EMAIL_CONFIRM_ON', '请在 Supabase 关闭 Confirm email 后再注册')
  }
  if (/invalid login credentials/i.test(msg)) {
    return makeError('INVALID_CREDENTIALS', '学号或密码错误')
  }
  if (/database error saving new user/i.test(msg)) {
    return makeError('PROFILE_CREATE_FAILED', '注册信息写入失败，请检查数据库触发器')
  }
  if (status === 401 || status === 403) {
    return makeError(code || 'UNAUTHORIZED', msg || '没有权限，请重新登录')
  }
  return makeError(code || 'AUTH_FAILED', msg || '操作失败，请稍后重试')
}

async function fetchProfile() {
  if (!session.value) return null
  if (profilePromise) return profilePromise
  profilePromise = (async () => {
    const data = await getMyProfile(session.value.access_token)
    if (!data || !data.id) {
      throw makeError('PROFILE_NOT_FOUND', '用户资料不存在，请联系管理员')
    }
    profile.value = data
    return data
  })()
  try {
    return await profilePromise
  } finally {
    profilePromise = null
  }
}

function profileFromSession(raw, fallbackStudentId) {
  const u = raw && raw.user
  const meta = (u && u.user_metadata) || {}
  if (!u || !u.id || !meta.student_id) return null
  return {
    id: u.id,
    student_id: String(meta.student_id || fallbackStudentId || ''),
    full_name: String(meta.full_name || ''),
    enrollment_year: meta.enrollment_year ? Number(meta.enrollment_year) : null,
    major_code: String(meta.major_code || ''),
    major_name: majorName(meta.major_code),
    created_at: u.created_at || null
  }
}

function applySession(raw) {
  const s = normalizeSession(raw)
  if (!s) throw makeError('NO_SESSION', '登录未返回会话')
  session.value = s
  saveSession(s)
  return s
}

async function restore() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    authError.value = ''
    let s = loadSession()
    try {
      if (s && isSessionExpired(s)) {
        const refreshed = await refreshSession(s.refresh_token)
        s = applySession(refreshed)
      }
      session.value = s
      if (s) {
        try {
          await fetchProfile()
        } catch (e) {
          const mapped = mapAuthError(e)
          if (mapped.code === 'UNAUTHORIZED' || mapped.code === 'PROFILE_NOT_FOUND') {
            session.value = null
            profile.value = null
            clearSession()
          } else {
            authError.value = mapped.message
          }
        }
      }
    } catch (e) {
      session.value = null
      profile.value = null
      clearSession()
      authError.value = mapAuthError(e).message
    } finally {
      ready.value = true
    }
  })()
  return initPromise
}

async function login(studentIdRaw, password, captchaToken) {
  const studentId = normalizeStudentId(studentIdRaw)
  if (!isValidStudentId(studentId)) {
    throw makeError('INVALID_STUDENT_ID', '请输入 12 位学号')
  }
  if (!isValidPassword(password)) {
    throw makeError('INVALID_PASSWORD', '密码至少 8 位且同时包含字母和数字')
  }
  busy.value = true
  try {
    const salt = await getLoginSalt(studentId)
    const hash = passwordHash(salt, password)
    const raw = await signInWithPassword({
      email: emailForStudentId(studentId),
      password: hash,
      captchaToken
    })
    applySession(raw)
    const localProfile = profileFromSession(raw, studentId)
    if (localProfile) {
      profile.value = localProfile
    } else {
      await fetchProfile()
    }
    saveLastStudentId(studentId)
    resetHomeCache()
    return profile.value
  } catch (e) {
    const mapped = mapAuthError(e)
    if (mapped.code === 'UNAUTHORIZED') {
      session.value = null
      profile.value = null
      clearSession()
    }
    throw mapped
  } finally {
    busy.value = false
  }
}

async function register(form, captchaToken) {
  const fullName = String(form.fullName || '').trim()
  if (!isValidName(fullName)) {
    throw makeError('INVALID_NAME', '姓名需为 2-50 个字符')
  }
  if (!isValidPassword(form.password)) {
    throw makeError('INVALID_PASSWORD', '密码至少 8 位且同时包含字母和数字')
  }
  if (form.password !== form.confirmPassword) {
    throw makeError('PASSWORD_MISMATCH', '两次输入的密码不一致')
  }

  busy.value = true
  try {
    const studentId = generateStudentId(form.enrollmentYear, form.majorCode)
    const salt = randomHex(16)
    const hash = passwordHash(salt, form.password)

    const result = await signUp({
      email: emailForStudentId(studentId),
      password: hash,
      captchaToken,
      metadata: {
        student_id: studentId,
        full_name: fullName,
        enrollment_year: Number(form.enrollmentYear),
        major_code: form.majorCode,
        password_salt: salt
      }
    })

    if (!result.session) {
      throw makeError(
        'EMAIL_CONFIRM_ON',
        '注册已提交但没有返回登录会话：请在 Supabase 关闭 Confirm email 后重试'
      )
    }

    applySession(result.session)
    try {
      await fetchProfile()
    } catch (e) {
      // 触发器可能失败；清理会话，避免半登录状态
      session.value = null
      profile.value = null
      clearSession()
      throw e
    }
    saveLastStudentId(studentId)
    resetHomeCache()
    return { studentId, profile: profile.value, majorName: majorName(form.majorCode) }
  } catch (e) {
    throw mapAuthError(e)
  } finally {
    busy.value = false
  }
}

async function logout() {
  busy.value = true
  try {
    if (session.value && session.value.access_token) {
      await signOut(session.value.access_token)
    }
  } finally {
    session.value = null
    profile.value = null
    clearSession()
    resetHomeCache()
    initPromise = null
    busy.value = false
    try {
      uni.reLaunch({ url: '/pages/auth/login' })
    } catch (e) {}
  }
}

async function deleteAccount(studentId, confirmText) {
  if (!session.value) throw makeError('UNAUTHORIZED', '请先登录')
  busy.value = true
  try {
    await rpc(
      'delete_my_account',
      { p_student_id: String(studentId || ''), p_confirm_text: String(confirmText || '') },
      session.value.access_token
    )
    session.value = null
    profile.value = null
    clearSession()
    clearLastStudentId()
    resetHomeCache()
    initPromise = null
    try {
      uni.reLaunch({ url: '/pages/auth/login' })
    } catch (e) {}
  } catch (e) {
    throw mapAuthError(e)
  } finally {
    busy.value = false
  }
}

async function ensureAccessToken() {
  if (!session.value) throw makeError('UNAUTHORIZED', '请先登录')
  if (!isSessionExpired(session.value)) return session.value.access_token
  const raw = await refreshSession(session.value.refresh_token)
  applySession(raw)
  return session.value.access_token
}

const isLoggedIn = computed(() => !!session.value)

export function useAuth() {
  return {
    session,
    profile,
    ready,
    busy,
    authError,
    isLoggedIn,
    restore,
    login,
    register,
    logout,
    deleteAccount,
    ensureAccessToken,
    fetchProfile,
    generateStudentId,
    emailForStudentId,
    passwordHash
  }
}
