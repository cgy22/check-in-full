// composables/useCaptcha.js
// 业务动作（建班/加班/补签/改资料）的人机验证：
// Turnstile token -> Edge Function captcha-verify -> captcha_ticket
import { verifyCaptcha } from '../utils/authApi'
import { makeError } from '../utils/http'
import { useAuth } from './useAuth'

export function useCaptcha() {
  const auth = useAuth()

  async function issue(purpose, token) {
    if (!token) {
      throw makeError('CAPTCHA_REQUIRED', '请先完成人机验证')
    }
    const accessToken = await auth.ensureAccessToken()
    const res = await verifyCaptcha(purpose, token, accessToken)
    if (!res || res.ok === false || !res.data || !res.data.ticket) {
      throw makeError(
        (res && res.code) || 'CAPTCHA_FAILED',
        (res && res.message) || '人机验证失败，请重试'
      )
    }
    return res.data.ticket
  }

  return { issue }
}
