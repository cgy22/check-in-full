'use strict'

const { store, fail, iso, requireThat } = require('./store')
const accounts = require('./accounts')
const classes = require('./classes')
const events = require('./events')
const appeals = require('./appeals')

const methods = Object.assign(Object.create(null), accounts.methods, classes.methods, events.methods, appeals.methods, {
  get_server_time: ({ now }) => ({ now: iso(now), epoch_ms: now, timezone: 'UTC' })
})
const publicMethods = new Set([
  'get_server_time', 'captcha_create', 'captcha_solve', 'register_account', 'login_account', 'refresh_session'
])

exports.main = async (request, cloudContext) => {
  try {
    const method = request && request.method
    if (typeof method !== 'string' || !Object.hasOwn(methods, method)) fail('NOT_FOUND', '接口不存在')
    const params = request.params == null ? {} : request.params
    requireThat(typeof params === 'object' && !Array.isArray(params), 'INVALID_PARAMETER', '参数格式不正确')

    const ctx = { db: store(uniCloud.database()), now: Date.now(), platform: cloudContext.PLATFORM }
    if (!publicMethods.has(method)) {
      Object.assign(ctx, await accounts.authenticate(ctx, request.accessToken, method === 'delete_my_account'))
    } else if (method === 'captcha_create' || method === 'captcha_solve') {
      if (request.accessToken) Object.assign(ctx, await accounts.authenticate(ctx, request.accessToken))
      ctx.clientIp = cloudContext.CLIENTIP || 'unknown'
    }
    return { ok: true, data: await methods[method](ctx, params) }
  } catch (error) {
    if (error.businessCode) return { ok: false, code: error.businessCode, message: error.message }
    console.error('valencia-checkin operation failed', request && request.method, error.code || error.errCode || error.name)
    return { ok: false, code: 'SERVER_ERROR', message: '服务器操作失败，请稍后重试' }
  }
}
