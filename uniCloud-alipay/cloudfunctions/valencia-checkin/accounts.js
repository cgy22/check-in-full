'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const { promisify } = require('node:util')
const { fail, requireThat, text, length, id, token, hash, iso, key } = require('./store')

const scrypt = promisify(crypto.scrypt)
const ACCESS_AGE = 60 * 60 * 1000
const REFRESH_AGE = 30 * 24 * ACCESS_AGE
const CAPTCHA_AGE = 5 * 60 * 1000
const guestActions = new Set(['register', 'login'])
const privateActions = new Set([
  'create_class', 'join_class', 'create_checkin', 'appeal', 'profile_update', 'change_password'
])
const nativePlatforms = new Set(['app', 'app-plus', 'app-android', 'app-ios'])
let renderer

function matches(actual, expected) {
  return typeof expected === 'string' && actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected, 'ascii'))
}

async function passwordDigest(password, salt) {
  return (await scrypt(typeof password === 'string' && password.length <= 256 ? password : '', salt, 64)).toString('hex')
}

function validatePassword(password) {
  requireThat(typeof password === 'string' && password.length >= 8 && password.length <= 64 &&
    !/\s/.test(password) && /[a-z]/i.test(password) && /\d/.test(password),
  'INVALID_PASSWORD', '密码需为 8-64 位且同时包含字母和数字，不能有空格')
}

async function profileInput(db, params) {
  const full_name = text(params.full_name)
  const enrollment_year = params.enrollment_year
  const major_code = text(params.major_code)
  requireThat(length(full_name) >= 2 && length(full_name) <= 50 && !/\p{Cc}/u.test(full_name),
    'INVALID_NAME', '姓名需为 2-50 个字符')
  requireThat(Number.isInteger(enrollment_year) && enrollment_year >= 2000 && enrollment_year <= 2100,
    'INVALID_YEAR', '入学年份不合法')
  requireThat(/^\d{2}$/.test(major_code) && await db.get('majors', major_code), 'INVALID_MAJOR', '专业不合法')
  return { full_name, enrollment_year, major_code }
}

async function getProfile(db, account) {
  if (!account) return null
  const { _id, student_id, full_name, enrollment_year, major_code, created_at } = account
  const major = await db.get('majors', major_code)
  return { id: _id, student_id, full_name, enrollment_year, major_code, major_name: major?.name || '', created_at }
}

async function people(db, ids) {
  const [profiles, majors] = await Promise.all([
    db.byIds('accounts', ids), db.find('majors', {})
  ])
  const majorNames = new Map(majors.map(major => [major._id, major.name]))
  return new Map([...profiles].map(([id, account]) => [id, {
    user_id: id,
    student_id: account.student_id,
    full_name: account.full_name,
    enrollment_year: account.enrollment_year,
    major_name: majorNames.get(account.major_code) || ''
  }]))
}

function newTokens() {
  return { access: token(), refresh: token() }
}

function sessionFields(tokens, user, now, refreshExpires = now + REFRESH_AGE) {
  return {
    user_id: user._id,
    credential_version: user.credential_version,
    access_hash: hash(tokens.access),
    refresh_hash: hash(tokens.refresh),
    access_expires: now + ACCESS_AGE,
    refresh_expires: refreshExpires
  }
}

function sessionResult(sessionId, tokens, user, now) {
  return {
    access_token: `${sessionId}.${tokens.access}`,
    refresh_token: `${sessionId}.${tokens.refresh}`,
    expires_in: ACCESS_AGE / 1000,
    expires_at: Math.floor((now + ACCESS_AGE) / 1000),
    token_type: 'bearer',
    user: { id: user._id }
  }
}

function readToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) {
    fail('UNAUTHORIZED', '请重新登录')
  }
  return value.split('.')
}

async function authenticate(ctx, value, allowDeleting = false) {
  const [sessionId, secret] = readToken(value)
  const session = await ctx.db.get('sessions', sessionId)
  requireThat(session && session.access_expires > ctx.now && matches(hash(secret), session.access_hash),
    'UNAUTHORIZED', '登录已过期，请重新登录')
  const account = await ctx.db.get('accounts', session.user_id)
  requireThat(account && (allowDeleting || !account.deleting) && account.credential_version === session.credential_version,
    'UNAUTHORIZED', '登录已过期，请重新登录')
  return { uid: account._id, account, sessionId }
}

async function audit(db, ctx, action, entity, entityId, metadata = {}) {
  await db.add('audit', id(), {
    actor_id: ctx.uid || null,
    action,
    entity,
    entity_id: entityId,
    metadata,
    created_at: iso(ctx.now)
  })
}

function checkCaptchaAction(ctx, action) {
  requireThat(ctx.uid ? privateActions.has(action) : guestActions.has(action),
    'CAPTCHA_FAILED', '验证用途不正确')
}

async function consumeTicket(db, ctx, action, ticket, required = true) {
  if (ticket == null && !required && nativePlatforms.has(ctx.platform)) return
  const entry = await db.get('captcha', ticket)
  requireThat(entry && entry.type === 'ticket' && entry.action === action && entry.owner === (ctx.uid || '') &&
    entry.expires_at > ctx.now, 'CAPTCHA_FAILED', '请重新完成人机验证')
  await db.remove('captcha', entry._id)
}

async function drawCaptcha() {
  const svgCaptcha = require('svg-captcha')
  const { Resvg, initWasm } = require('@resvg/resvg-wasm')
  if (!renderer) renderer = fs.readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')).then(initWasm)
  await renderer
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const answer = Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('')
  const svg = svgCaptcha(answer, { width: 160, height: 58, noise: 3, color: true, background: '#f5eae7' })
  const image = new Resvg(svg, { font: { loadSystemFonts: false } })
  const pixels = image.render()
  try {
    return { answer, image: `data:image/png;base64,${Buffer.from(pixels.asPng()).toString('base64')}` }
  } finally {
    pixels.free()
    image.free()
  }
}

async function createCaptcha(ctx, { action }) {
  checkCaptchaAction(ctx, action)
  const bucket = hash(key(ctx.clientIp, ctx.uid || 'guest'))
  await ctx.db.transaction(async db => {
    const rate = await db.get('captcha_rates', bucket)
    const count = rate && rate.expires_at > ctx.now ? rate.count + 1 : 1
    requireThat(count <= 24, 'CAPTCHA_RATE_LIMIT', '验证请求过多，请稍后重试')
    const fields = { count, expires_at: count === 1 ? ctx.now + CAPTCHA_AGE : rate.expires_at }
    if (rate) await db.update('captcha_rates', bucket, fields)
    else await db.add('captcha_rates', bucket, fields)
  })
  const challenge = token()
  const rendered = await drawCaptcha()
  await ctx.db.add('captcha', challenge, {
    type: 'challenge', owner: ctx.uid || '', action, answer_hash: hash(key(challenge, rendered.answer)),
    expires_at: ctx.now + CAPTCHA_AGE
  })
  return { challenge, image: rendered.image }
}

async function solveCaptcha(ctx, { action, challenge, answer }) {
  checkCaptchaAction(ctx, action)
  const ticket = token()
  const result = await ctx.db.transaction(async db => {
    const row = await db.get('captcha', challenge)
    requireThat(row && row.type === 'challenge' && row.action === action && row.owner === (ctx.uid || '') &&
      row.expires_at > ctx.now, 'CAPTCHA_FAILED', '验证码已过期，请换一张')
    await db.remove('captcha', row._id)
    if (!matches(hash(key(challenge, text(answer).slice(0, 20).toUpperCase())), row.answer_hash)) return null
    const expires_at = ctx.now + CAPTCHA_AGE
    await db.add('captcha', ticket, { type: 'ticket', owner: row.owner, action, expires_at })
    return { ticket, valid_for_ms: CAPTCHA_AGE }
  })
  requireThat(result, 'CAPTCHA_FAILED', '验证码不正确，请重试')
  return result
}

const methods = {
  captcha_create: createCaptcha,
  captcha_solve: solveCaptcha,
  async register_account(ctx, params) {
    validatePassword(params.password)
    const profile = await profileInput(ctx.db, params)
    const password_salt = token()
    const password_hash = await passwordDigest(params.password, password_salt)
    const userId = id()
    const sessionId = id()
    const tokens = newTokens()
    const user = await ctx.db.transaction(async db => {
      const studentId = `${profile.enrollment_year}${profile.major_code}${String(crypto.randomInt(1000000)).padStart(6, '0')}`
      requireThat(!await db.get('student_ids', studentId), 'STUDENT_ID_TAKEN', '学号生成冲突，请重新注册')
      await consumeTicket(db, ctx, 'register', params.captchaToken)
      const fields = {
        ...profile, student_id: studentId, password_salt, password_hash, credential_version: 1, created_at: iso(ctx.now)
      }
      const account = { _id: userId, ...fields }
      await db.add('accounts', userId, fields)
      await db.add('student_ids', studentId, { user_id: userId })
      await db.add('sessions', sessionId, sessionFields(tokens, account, ctx.now))
      return account
    })
    return { session: sessionResult(sessionId, tokens, user, ctx.now), profile: await getProfile(ctx.db, user) }
  },
  async login_account(ctx, params) {
    const studentId = text(params.studentId)
    requireThat(/^\d{12}$/.test(studentId), 'INVALID_STUDENT_ID', '请输入 12 位学号')
    await ctx.db.transaction(db => consumeTicket(db, ctx, 'login', params.captchaToken))
    const lookup = await ctx.db.get('student_ids', studentId)
    const user = lookup && await ctx.db.get('accounts', lookup.user_id)
    const digest = await passwordDigest(params.password, user?.password_salt || 'unknown-account')
    requireThat(user && !user.deleting && matches(digest, user.password_hash), 'INVALID_CREDENTIALS', '学号或密码错误')
    const tokens = newTokens()
    const sessionId = id()
    await ctx.db.add('sessions', sessionId, sessionFields(tokens, user, ctx.now))
    return { session: sessionResult(sessionId, tokens, user, ctx.now), profile: await getProfile(ctx.db, user) }
  },
  async refresh_session(ctx, { refreshToken }) {
    const [sessionId, secret] = readToken(refreshToken)
    const tokens = newTokens()
    return ctx.db.transaction(async db => {
      const session = await db.get('sessions', sessionId)
      requireThat(session && session.refresh_expires > ctx.now && matches(hash(secret), session.refresh_hash),
        'UNAUTHORIZED', '登录已过期，请重新登录')
      const user = await db.get('accounts', session.user_id)
      requireThat(user && user.credential_version === session.credential_version, 'UNAUTHORIZED', '请重新登录')
      await db.update('sessions', sessionId, sessionFields(tokens, user, ctx.now, session.refresh_expires))
      return sessionResult(sessionId, tokens, user, ctx.now)
    })
  },
  async logout_account(ctx) {
    await ctx.db.remove('sessions', ctx.sessionId)
    return { signed_out: true }
  },
  async get_my_profile(ctx) {
    const [profile, memberships, events, received, mine] = await Promise.all([
      getProfile(ctx.db, ctx.account),
      ctx.db.find('members', { user_id: ctx.uid, active: true }),
      ctx.db.find('events', { creator_id: ctx.uid, deleted: false }),
      ctx.db.find('appeals', { creator_id: ctx.uid, status: 'pending' }),
      ctx.db.find('appeals', { user_id: ctx.uid, status: 'pending' })
    ])
    const classes = await ctx.db.byIds('classes', [...memberships, ...events, ...received, ...mine].map(row => row.class_id))
    const live = row => classes.get(row.class_id)?.deleted === false
    return {
      ...profile,
      created_classes: memberships.filter(row => row.role === 'owner' && live(row)).length,
      joined_classes: memberships.filter(row => row.role === 'member' && live(row)).length,
      published_events: events.filter(live).length,
      pending_received_appeals: received.filter(live).length,
      my_pending_appeals: mine.filter(live).length
    }
  },
  async update_profile(ctx, params) {
    const profile = await profileInput(ctx.db, {
      full_name: params.p_full_name, enrollment_year: params.p_enrollment_year, major_code: params.p_major_code
    })
    await ctx.db.transaction(async db => {
      await consumeTicket(db, ctx, 'profile_update', params.p_captcha_ticket, false)
      await db.update('accounts', ctx.uid, profile)
      await audit(db, ctx, 'update_profile', 'profile', ctx.uid)
    })
    ctx.account = { ...ctx.account, ...profile }
    return methods.get_my_profile(ctx)
  },
  async change_password(ctx, { oldPassword, newPassword, ticket }) {
    validatePassword(newPassword)
    requireThat(newPassword !== oldPassword, 'INVALID_PASSWORD', '新密码不能和旧密码相同')
    const digest = await passwordDigest(oldPassword, ctx.account.password_salt)
    requireThat(matches(digest, ctx.account.password_hash), 'INVALID_PASSWORD', '旧密码不正确')
    const password_salt = token()
    const password_hash = await passwordDigest(newPassword, password_salt)
    await ctx.db.transaction(async db => {
      const user = await db.get('accounts', ctx.uid)
      requireThat(user && user.credential_version === ctx.account.credential_version,
        'UNAUTHORIZED', '登录凭据已更改，请重新登录')
      await consumeTicket(db, ctx, 'change_password', ticket, false)
      const credential_version = user.credential_version + 1
      await db.update('accounts', ctx.uid, { password_salt, password_hash, credential_version })
      await db.update('sessions', ctx.sessionId, { credential_version })
      await audit(db, ctx, 'change_password', 'profile', ctx.uid)
    })
    return { updated: true }
  },
  async delete_my_account(ctx, params) {
    requireThat(text(params.p_confirm_text) === '注销账号', 'CONFIRM_REQUIRED', '请输入“注销账号”四个字以确认')
    requireThat(text(params.p_student_id) === ctx.account.student_id, 'STUDENT_ID_MISMATCH', '学号不匹配，请输入完整学号')
    if (!ctx.account.deleting) {
      await ctx.db.transaction(async db => {
        await db.update('accounts', ctx.uid, { deleting: true })
        await audit(db, ctx, 'delete_account', 'profile', ctx.uid)
      })
    }
    const { cleanupAccount } = require('./classes')
    await cleanupAccount(ctx)
    await ctx.db.transaction(async db => {
      await db.remove('student_ids', ctx.account.student_id)
      await db.remove('accounts', ctx.uid)
    })
    await ctx.db.removeWhere('sessions', { user_id: ctx.uid }).catch(() => {})
    return { deleted: true }
  }
}

module.exports = { methods, authenticate, consumeTicket, audit, people }
