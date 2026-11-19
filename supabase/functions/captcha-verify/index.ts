// Supabase Edge Function: captcha-verify
// 作用：校验 Cloudflare Turnstile token，给已登录用户签发一次性 captcha_tickets。
// 部署：supabase functions deploy captcha-verify --no-verify-jwt
// Secret：supabase secrets set TURNSTILE_SECRET=...
//
// 请求：POST { token, purpose }
// Header：Authorization: Bearer <supabase access_token>
// 返回：{ ok: true, data: { ticket, expires_at } }

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const ALLOWED_PURPOSES = new Set([
  'create_class',
  'join_class',
  'appeal',
  'create_checkin',
  'profile_update',
  'change_password'
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '只支持 POST' }, 405)
  }

  try {
    const body = await req.json().catch(() => null)
    const token = body && typeof body.token === 'string' ? body.token : ''
    const purpose = body && typeof body.purpose === 'string' ? body.purpose : ''

    if (!token) {
      return json({ ok: false, code: 'CAPTCHA_REQUIRED', message: '缺少人机验证 token' }, 400)
    }
    if (!ALLOWED_PURPOSES.has(purpose)) {
      return json({ ok: false, code: 'INVALID_PURPOSE', message: '人机验证用途不合法' }, 400)
    }

    const turnstileSecret = Deno.env.get('TURNSTILE_SECRET')
    if (!turnstileSecret) {
      return json(
        { ok: false, code: 'SERVER_MISCONFIGURED', message: '服务器未配置 TURNSTILE_SECRET' },
        500
      )
    }

    const form = new URLSearchParams({
      secret: turnstileSecret,
      response: token
    })
    const verifyRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form
      }
    )
    const verify = await verifyRes.json().catch(() => null)

    if (!verify || verify.success !== true) {
      const codes = Array.isArray(verify && verify['error-codes'])
        ? verify['error-codes'].join(',')
        : ''
      return json(
        {
          ok: false,
          code: 'CAPTCHA_FAILED',
          message: '人机验证服务校验失败，请确认 Site Key 与 TURNSTILE_SECRET 是否匹配',
          details: codes
        },
        400
      )
    }
    if (verify.action && verify.action !== purpose) {
      return json(
        { ok: false, code: 'CAPTCHA_ACTION_MISMATCH', message: '人机验证用途不匹配' },
        400
      )
    }

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return json({ ok: false, code: 'UNAUTHENTICATED', message: '请先登录' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        { ok: false, code: 'SERVER_MISCONFIGURED', message: '服务器缺少 Supabase 环境变量' },
        500
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const {
      data: { user },
      error: userError
    } = await admin.auth.getUser(jwt)

    if (userError || !user) {
      return json({ ok: false, code: 'UNAUTHENTICATED', message: '登录已失效，请重新登录' }, 401)
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const { data, error } = await admin
      .from('captcha_tickets')
      .insert({
        purpose,
        user_id: user.id,
        expires_at: expiresAt
      })
      .select('id, expires_at')
      .single()

    if (error || !data) {
      // 服务端日志只记录错误字段，不记录 token 或用户凭据
      console.error('captcha ticket insert failed', {
        code: error && error.code,
        message: error && error.message,
        details: error && error.details,
        hint: error && error.hint
      })
      return json(
        { ok: false, code: 'TICKET_CREATE_FAILED', message: '人机验证票据写入失败' },
        500
      )
    }

    return json({
      ok: true,
      data: {
        ticket: data.id,
        expires_at: data.expires_at
      }
    })
  } catch (e) {
    return json(
      { ok: false, code: 'INTERNAL_ERROR', message: '人机验证服务异常' },
      500
    )
  }
})
