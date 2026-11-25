'use strict'

const { randomInt } = require('node:crypto')
const { requireThat, text, length, id, key, iso } = require('./store')
const { audit, consumeTicket, people } = require('./accounts')

const newest = (left, right) => right.created_at.localeCompare(left.created_at)

async function getClass(db, classId) {
  const row = await db.get('classes', classId)
  requireThat(row && !row.deleted, 'NOT_FOUND', '班级不存在')
  return row
}

async function ownedClass(db, classId, uid) {
  const row = await getClass(db, classId)
  requireThat(row.owner_id === uid, 'FORBIDDEN', '只有班级创建者可以执行此操作')
  return row
}

function activeAt(member, at) {
  return !!member && member.role === 'member' &&
    member.periods.some(period => period.start <= at && (period.end == null || period.end > at))
}

function classSummary(row, membership, ownerName) {
  const owner = membership.role === 'owner'
  return {
    id: row._id, name: row.name, owner_id: row.owner_id, owner_name: ownerName || '',
    created_at: row.created_at, my_role: membership.role,
    invite_code: owner ? row.invite_code : null,
    invite_expires_at: owner ? row.invite_expires_at : null
  }
}

async function closeMembership(ctx, classId, userId, ownerAction) {
  return ctx.db.transaction(async db => {
    const row = ownerAction ? await ownedClass(db, classId, ctx.uid) : await getClass(db, classId)
    requireThat(row.owner_id !== userId, 'CANNOT_LEAVE_OWNER', '班级创建者不能退出或被移除')
    const memberId = key(classId, userId)
    const member = await db.get('members', memberId)
    requireThat(member?.active, 'NOT_MEMBER', '该用户不在班级中')
    const now = Date.now()
    const periods = member.periods.slice()
    periods[periods.length - 1] = { ...periods[periods.length - 1], end: now }
    await db.update('members', memberId, { active: false, periods })
    await db.update('classes', classId, { version: row.version + 1 })
    await audit(db, ctx, ownerAction ? 'kick_class_member' : 'leave_class', 'class', classId, { user_id: userId })
    return { removed: true }
  })
}

async function removeClass(ctx, row) {
  await ctx.db.transaction(async db => {
    const current = await db.get('classes', row._id)
    if (!current || current.deleted) return
    await db.update('classes', row._id, { deleted: true })
    await db.remove('invites', row.invite_code)
    await audit(db, ctx, 'delete_class', 'class', row._id, { name: row.name })
  })
  await Promise.all(
    ['members', 'events', 'records', 'appeals'].map(name => ctx.db.removeWhere(name, { class_id: row._id }))
  )
  await ctx.db.remove('classes', row._id)
}

async function cleanupAccount(ctx) {
  const classes = await ctx.db.find('classes', { owner_id: ctx.uid })
  for (const row of classes) await removeClass(ctx, row)
  await Promise.all([
    ...['members', 'records', 'appeals'].map(name => ctx.db.removeWhere(name, { user_id: ctx.uid })),
    ctx.db.removeWhere('captcha', { owner: ctx.uid })
  ])
}

const methods = {
  async create_class(ctx, { p_name, p_validity_seconds, p_captcha_ticket }) {
    const name = text(p_name)
    requireThat(length(name) >= 1 && length(name) <= 50, 'INVALID_NAME', '班级名称需为 1-50 个字符')
    requireThat(Number.isInteger(p_validity_seconds) && p_validity_seconds >= 3600 && p_validity_seconds <= 31536000,
      'INVALID_VALIDITY', '邀请码有效期需在 1 小时到 365 天之间')
    const classId = id()
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const created_at = iso(ctx.now)
    const invite_expires_at = iso(ctx.now + p_validity_seconds * 1000)
    return ctx.db.transaction(async db => {
      let invite_code
      do {
        invite_code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('')
      } while (await db.get('invites', invite_code))
      await consumeTicket(db, ctx, 'create_class', p_captcha_ticket, false)
      await db.add('classes', classId, {
        name, owner_id: ctx.uid, created_at, invite_code, invite_expires_at, deleted: false, version: 0
      })
      await db.add('invites', invite_code, { class_id: classId })
      await db.add('members', key(classId, ctx.uid), {
        class_id: classId, user_id: ctx.uid, role: 'owner', joined_at: created_at, active: true, periods: []
      })
      await audit(db, ctx, 'create_class', 'class', classId, { name })
      return { class_id: classId, name, invite_code, invite_expires_at }
    })
  },
  async join_class(ctx, { p_code, p_captcha_ticket }) {
    const code = text(p_code).toUpperCase()
    requireThat(/^[A-Z2-9]{8}$/.test(code), 'INVALID_CODE', '邀请码格式不正确')
    const row = await ctx.db.transaction(async db => {
      const invite = await db.get('invites', code)
      requireThat(invite, 'INVALID_CODE', '邀请码不存在')
      const row = await getClass(db, invite.class_id)
      const now = Date.now()
      requireThat(Date.parse(row.invite_expires_at) > now, 'INVITE_EXPIRED', '邀请码已过期，请联系班级创建者')
      const memberId = key(row._id, ctx.uid)
      const member = await db.get('members', memberId)
      requireThat(!member?.active, 'ALREADY_MEMBER', '你已经在该班级中，无需重复加入')
      await consumeTicket(db, ctx, 'join_class', p_captcha_ticket, false)
      const fields = {
        class_id: row._id, user_id: ctx.uid, role: 'member', joined_at: iso(now), active: true,
        periods: [...(member?.periods || []), { start: now, end: null }]
      }
      if (member) await db.update('members', memberId, fields)
      else await db.add('members', memberId, fields)
      await db.update('classes', row._id, { version: row.version + 1 })
      await audit(db, ctx, 'join_class', 'class', row._id)
      return row
    })
    const owner = await ctx.db.get('accounts', row.owner_id)
    return { class_id: row._id, name: row.name, owner_id: row.owner_id, owner_name: owner?.full_name || '' }
  },
  async list_my_classes(ctx, { p_role = 'all' }) {
    requireThat(['all', 'owner', 'member'].includes(p_role), 'INVALID_ROLE', '查询角色不合法')
    const filter = { user_id: ctx.uid, active: true }
    if (p_role !== 'all') filter.role = p_role
    const memberships = await ctx.db.find('members', filter)
    const classes = await ctx.db.byIds('classes', memberships.map(row => row.class_id))
    const profiles = await ctx.db.byIds('accounts', [...classes.values()].map(row => row.owner_id))
    const items = []
    for (const membership of memberships) {
      const row = classes.get(membership.class_id)
      if (!row || row.deleted) continue
      const [members, events] = await Promise.all([
        ctx.db.find('members', { class_id: row._id, active: true }),
        ctx.db.find('events', { class_id: row._id, deleted: false })
      ])
      items.push({
        ...classSummary(row, membership, profiles.get(row.owner_id)?.full_name),
        member_count: members.length,
        upcoming_count: events.filter(event => Date.parse(event.start_at) > ctx.now &&
          (row.owner_id === ctx.uid || !event.is_surprise)).length,
        ended_count: events.filter(event => Date.parse(event.end_at) < ctx.now).length
      })
    }
    return { items: items.sort(newest) }
  },
  async get_class_detail(ctx, { p_class_id }) {
    const row = await getClass(ctx.db, p_class_id)
    const members = await ctx.db.find('members', { class_id: row._id, active: true })
    const membership = members.find(member => member.user_id === ctx.uid)
    requireThat(membership, 'FORBIDDEN', '你不是该班级成员')
    const isOwner = row.owner_id === ctx.uid
    const profiles = await people(ctx.db, isOwner ? members.map(member => member.user_id) : [row.owner_id])
    return {
      ...classSummary(row, membership, profiles.get(row.owner_id)?.full_name),
      member_count: members.length,
      members: isOwner ? members.filter(member => profiles.has(member.user_id))
        .map(member => ({ ...profiles.get(member.user_id), role: member.role, joined_at: member.joined_at }))
        .sort((a, b) => a.joined_at.localeCompare(b.joined_at)) : null
    }
  },
  kick_class_member(ctx, { p_class_id, p_user_id }) {
    requireThat(typeof p_user_id === 'string', 'INVALID_PARAMETER', '成员参数不正确')
    return closeMembership(ctx, p_class_id, p_user_id, true)
  },
  leave_class(ctx, { p_class_id }) {
    return closeMembership(ctx, p_class_id, ctx.uid, false)
  },
  async delete_class(ctx, { p_class_id }) {
    const row = await ctx.db.get('classes', p_class_id)
    requireThat(row && row.owner_id === ctx.uid, 'FORBIDDEN', '只有班级创建者可以删除班级')
    await removeClass(ctx, row)
    return { deleted: true }
  },
  async get_class_attendance(ctx, { p_class_id }) {
    await ownedClass(ctx.db, p_class_id, ctx.uid)
    const { buildRecord, statusCounts } = require('./events')
    const [members, events, records] = await Promise.all([
      ctx.db.find('members', { class_id: p_class_id, role: 'member', active: true }),
      ctx.db.find('events', { class_id: p_class_id, deleted: false, end_at: ctx.db.command.lt(iso(ctx.now)) }),
      ctx.db.find('records', { class_id: p_class_id })
    ])
    const stored = new Map(records.map(record => [record._id, record]))
    const profiles = await people(ctx.db, members.map(member => member.user_id))
    const items = members.filter(member => profiles.has(member.user_id)).map(member => {
      const rows = events.filter(event => activeAt(member, event.roster_at))
        .map(event => buildRecord(event, member.user_id, stored.get(key(event._id, member.user_id))))
      const counts = statusCounts(rows)
      return {
        ...profiles.get(member.user_id), role: member.role, joined_at: member.joined_at, ...counts,
        attendance_rate: counts.total ? Math.round(10000 * (counts.present + counts.makeup) / counts.total) / 10000 : 0
      }
    })
    return { items: items.sort((a, b) => a.student_id.localeCompare(b.student_id)) }
  },
  async get_class_member_attendance(ctx, { p_class_id, p_user_id }) {
    await ownedClass(ctx.db, p_class_id, ctx.uid)
    requireThat(typeof p_user_id === 'string', 'INVALID_PARAMETER', '成员参数不正确')
    const { buildRecord } = require('./events')
    const member = await ctx.db.get('members', key(p_class_id, p_user_id))
    requireThat(member?.active, 'NOT_MEMBER', '该用户不在班级中')
    const [events, records, profiles] = await Promise.all([
      ctx.db.find('events', { class_id: p_class_id, deleted: false, end_at: ctx.db.command.lt(iso(ctx.now)) }),
      ctx.db.find('records', { class_id: p_class_id, user_id: p_user_id }),
      people(ctx.db, [p_user_id])
    ])
    const stored = new Map(records.map(record => [record.event_id, record]))
    return {
      member: profiles.get(p_user_id),
      items: events.filter(event => activeAt(member, event.roster_at))
        .sort((a, b) => b.start_at.localeCompare(a.start_at))
        .map(event => {
          const record = buildRecord(event, p_user_id, stored.get(event._id))
          const latest = record.appeals.at(-1)
          return {
            event_id: event._id, title: event.title, start_at: event.start_at, end_at: event.end_at,
            timezone: event.timezone, status: record.status, method: record.method,
            is_late_slice: record.is_late_slice, checked_in_at: record.checked_in_at,
            appeal_status: latest?.status || null
          }
        })
    }
  }
}

module.exports = { methods, getClass, ownedClass, activeAt, cleanupAccount }
