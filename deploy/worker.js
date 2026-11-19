// Cloudflare Worker: VU Check-in Supabase proxy
// 部署后把 WORKER_PROXY_URL 填到 deploy/bridge.html。
//
// 路由方式二选一：
// 1) 直接使用 Worker 的 workers.dev 地址：
//    https://vu-checkin-proxy.<your-subdomain>.workers.dev
// 2) 绑定到 dornhub.eu.org 的子路径（推荐）：
//    dornhub.eu.org/checkin-api/*
//
// 请求：
//   GET/POST <worker>?path=/rest/v1/rpc/...
// Header:
//   apikey / Authorization / X-User-Token 由 bridge 传入
//
// 不在 Worker 里使用 service_role；只转发 anon key / 用户 JWT。

const SUPABASE_URL = 'https://hisewqjyxadmezeiwnzc.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_yedDW1qzLL3nsZySIugLNw_-r4FRFU_'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, apikey, X-User-Token, Prefer, Accept',
  'Access-Control-Max-Age': '86400'
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const path = url.searchParams.get('path') || ''
    if (!path) {
      return json({ error: 'missing_path', message: '缺少 path 参数' }, 400)
    }
    if (!/^\/(auth\/v1|rest\/v1|functions\/v1)\//.test(path)) {
      return json({ error: 'forbidden_path', message: '只允许转发 Supabase 路径' }, 403)
    }
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return json({ error: 'method_not_allowed', message: '请求方法不允许' }, 405)
    }

    const auth =
      request.headers.get('X-User-Token') ||
      request.headers.get('Authorization') ||
      `Bearer ${SUPABASE_ANON_KEY}`

    const headers = new Headers()
    headers.set('apikey', SUPABASE_ANON_KEY)
    headers.set('Authorization', auth.startsWith('Bearer ') ? auth : `Bearer ${auth}`)
    headers.set('Content-Type', request.headers.get('Content-Type') || 'application/json')
    headers.set('Accept', request.headers.get('Accept') || 'application/json')

    const prefer = request.headers.get('Prefer')
    if (prefer) headers.set('Prefer', prefer)

    let body
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text()
    }

    const target = `${SUPABASE_URL}${path}`
    let upstream
    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        body
      })
    } catch (e) {
      return json(
        { error: 'proxy_failed', message: e && e.message ? e.message : '无法连接 Supabase' },
        502
      )
    }

    const responseHeaders = new Headers(CORS)
    responseHeaders.set(
      'Content-Type',
      upstream.headers.get('Content-Type') || 'application/json; charset=utf-8'
    )
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    })
  }
}
