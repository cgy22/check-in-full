// utils/authApi.js
// 直接调用 Supabase Auth / PostgREST；不依赖 supabase-js，方便后续替换成桥接。
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'
import { httpRequest, makeError } from './http'

const AUTH_BASE = `${SUPABASE_URL}/auth/v1`
const REST_BASE = `${SUPABASE_URL}/rest/v1`

function headers(accessToken) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  }
}

function captchaMeta(captchaToken) {
  return captchaToken
    ? { gotrue_meta_security: { captcha_token: captchaToken } }
    : {}
}

function extractSession(data) {
  if (data && data.access_token) return data
  if (data && data.session && data.session.access_token) return data.session
  return null
}

function unwrapRpc(data) {
  if (data && data.ok === false) {
    throw makeError(data.code || 'RPC_FAILED', data.message || '操作失败', { data })
  }
  return data && data.data !== undefined ? data.data : data
}

export async function signUp({ email, password, metadata, captchaToken }) {
  const data = await httpRequest({
    url: `${AUTH_BASE}/signup`,
    method: 'POST',
    header: headers(),
    data: {
      email,
      password,
      data: metadata || {},
      ...captchaMeta(captchaToken)
    }
  })
  return { raw: data, session: extractSession(data) }
}

export async function signInWithPassword({ email, password, captchaToken }) {
  const data = await httpRequest({
    url: `${AUTH_BASE}/token?grant_type=password`,
    method: 'POST',
    header: headers(),
    data: {
      email,
      password,
      ...captchaMeta(captchaToken)
    }
  })
  const session = extractSession(data)
  if (!session) {
    throw makeError('NO_SESSION', '登录未返回会话，请检查 Supabase Auth 配置')
  }
  return session
}

export async function refreshSession(refreshToken) {
  const data = await httpRequest({
    url: `${AUTH_BASE}/token?grant_type=refresh_token`,
    method: 'POST',
    header: headers(),
    data: { refresh_token: refreshToken }
  })
  const session = extractSession(data)
  if (!session) {
    throw makeError('REFRESH_FAILED', '登录已过期，请重新登录')
  }
  return session
}

export async function getAuthUser(accessToken) {
  return httpRequest({
    url: `${AUTH_BASE}/user`,
    method: 'GET',
    header: headers(accessToken)
  })
}

export async function updatePassword(newPassword, accessToken) {
  return httpRequest({
    url: `${AUTH_BASE}/user`,
    method: 'PUT',
    header: headers(accessToken),
    data: { password: newPassword }
  })
}

export async function signOut(accessToken) {
  try {
    await httpRequest({
      url: `${AUTH_BASE}/logout`,
      method: 'POST',
      header: headers(accessToken),
      data: {}
    })
  } catch (e) {
    // 退出失败不阻塞本地清理
  }
}

export async function rpc(name, params = {}, accessToken = null) {
  const data = await httpRequest({
    url: `${REST_BASE}/rpc/${name}`,
    method: 'POST',
    header: headers(accessToken),
    data: params
  })
  return unwrapRpc(data)
}

function extractSalt(value, depth = 0) {
  if (value == null || depth > 4) return null
  if (typeof value === 'string') {
    try {
      return extractSalt(JSON.parse(value), depth + 1)
    } catch (e) {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const salt = extractSalt(item, depth + 1)
      if (salt) return salt
    }
    return null
  }
  if (typeof value === 'object') {
    if (typeof value.salt === 'string' && value.salt) return value.salt
    for (const key of ['data', 'result', 'get_login_salt']) {
      if (value[key] !== undefined) {
        const salt = extractSalt(value[key], depth + 1)
        if (salt) return salt
      }
    }
  }
  return null
}

export async function getLoginSalt(studentId) {
  const data = await rpc('get_login_salt', { p_student_id: studentId })
  const salt = extractSalt(data)
  if (!salt) {
    throw makeError('SALT_MISSING', '无法获取登录凭据，请稍后重试')
  }
  return salt
}

export async function getServerTime(accessToken = null) {
  return rpc('get_server_time', {}, accessToken)
}

export async function getMyProfile(accessToken) {
  return rpc('get_my_profile', {}, accessToken)
}

export async function verifyCaptcha(purpose, token, accessToken) {
  const data = await httpRequest({
    url: `${SUPABASE_URL}/functions/v1/captcha-verify`,
    method: 'POST',
    header: headers(accessToken),
    data: { token, purpose }
  })
  if (data && data.ok === false) {
    throw makeError(data.code || 'CAPTCHA_FAILED', data.message || '人机验证失败', { data })
  }
  return data
}
