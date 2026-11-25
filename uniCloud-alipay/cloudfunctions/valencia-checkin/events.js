'use strict'

const { createHmac } = require('node:crypto')
const { fail, requireThat, text, length, id, token, hash, iso, key, publicDoc } = require('./store')
const { audit, consumeTicket, people } = require('./accounts')
const { getClass, ownedClass, activeAt } = require('./classes')

const SLICE_MS = 30000
const FIVE_MINUTES = 300000
const DAY = 86400000
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const recordKeyPattern = new RegExp(`^(${uuid}):(${uuid})$`)

function eventState(event, now) {
  if (now < Date.parse(event.start_at)) return 'upcoming'
  return now <= Date.parse(event.end_at) ? 'active' : 'ended'
}

function eventOutput(event, classRow) {
  const { secret, deleted, roster_at, ...fields } = event
  return { ...publicDoc(fields), class_name: classRow.name }
}

function recordOutput(record) {
  if (!record) return null
  const { class_id, appeals, failed_slice, failures, code_hash, device_id, latitude, longitude, ...fields } = record
  return publicDoc(fields)
}

function statusCounts(records) {
  const counts = { total: records.length, present: 0, makeup: 0, absent: 0 }
  for (const record of records) {
    const status = record.status === 'absent' ? 'absent' : record.method === 'makeup' ? 'makeup' : 'present'
    counts[status]++
  }
  return counts
}

function statusFields(now, present) {
  return {
    status: present ? 'present' : 'absent', method: present ? 'makeup' : null,
    is_late_slice: false, slice_index: null, code_hash: null, checked_in_at: present ? iso(now) : null,
    distance_m: null, latitude: null, longitude: null, device_id: null, device_label: null
  }
}

function buildRecord(event, userId, stored) {
  return stored || {
    _id: key(event._id, userId), event_id: event._id, class_id: event.class_id, user_id: userId,
    created_at: event.created_at, ...statusFields(0, false), appeals: [], failed_slice: null, failures: 0
  }
}

async function putRecord(db, record, stored) {
  const { _id, ...fields } = record
  if (stored) await db.update('records', _id, fields)
  else await db.add('records', _id, fields)
}

async function visibleEvent(db, eventId) {
  const event = await db.get('events', eventId)
  requireThat(event && !event.deleted, 'FORBIDDEN', '活动不存在或暂不可见')
  const classRow = await getClass(db, event.class_id)
  return { event, classRow }
}

async function ownedEvent(db, eventId, uid) {
  const result = await visibleEvent(db, eventId)
  requireThat(result.event.creator_id === uid, 'FORBIDDEN', '只有活动创建者可以执行此操作')
  return result
}

async function eligibleRecord(db, event, uid) {
  const member = await db.get('members', key(event.class_id, uid))
  requireThat(activeAt(member, event.roster_at), 'NOT_PARTICIPANT', '你不是该签到的参与成员')
  const stored = await db.get('records', key(event._id, uid))
  return { stored, record: buildRecord(event, uid, stored) }
}

async function allRecords(db, event) {
  const [members, records] = await Promise.all([
    db.find('members', { class_id: event.class_id, role: 'member' }),
    db.find('records', { event_id: event._id })
  ])
  const stored = new Map(records.map(record => [record.user_id, record]))
  return members.filter(member => activeAt(member, event.roster_at))
    .map(member => buildRecord(event, member.user_id, stored.get(member.user_id)))
}

function rotatingCode(event, slice) {
  const digest = createHmac('sha256', Buffer.from(event.secret, 'hex')).update(String(slice)).digest()
  return String(digest.readUInt32BE(0) % 1000000).padStart(6, '0')
}

function codeData(event, now) {
  requireThat(now >= Date.parse(event.start_at) - FIVE_MINUTES, 'NOT_STARTED', '签到还未开始')
  requireThat(now <= Date.parse(event.end_at), 'ENDED', '签到已结束')
  const slice_index = Math.floor(now / SLICE_MS)
  const expires = (slice_index + 1) * SLICE_MS
  return {
    code: rotatingCode(event, slice_index), slice_index, expires_at: iso(expires),
    seconds_left: Math.floor((expires - now) / 1000), server_now: iso(now), slice_seconds: SLICE_MS / 1000
  }
}

function zonedTime(input, formatter) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text(input))
  requireThat(match, 'INVALID_TIME', '开始/结束时间格式不正确')
  const wall = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}Z`)
  const wallText = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}`
  requireThat(Number.isFinite(wall) && iso(wall).slice(0, 19) === wallText, 'INVALID_TIME', '开始/结束时间不合法')
  const wallAt = timestamp => {
    const values = Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]))
    return Date.parse(`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`)
  }
  const before = wall - DAY
  const after = wall + DAY
  const candidates = [wall - (wallAt(before) - before), wall - (wallAt(after) - after)]
  // 与 PostgreSQL 一致，秋季重叠取较晚一刻，春季跳过的时刻按跳转前偏移量计算。
  const valid = candidates.filter(value => wallAt(value) === wall)
  return valid.length ? Math.max(...valid) : candidates[0]
}

function within(value, max) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max
}

function distance(lat1, lng1, lat2, lng2) {
  const rad = value => value * Math.PI / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(a, 1)))
}

async function createEvent(ctx, params, local) {
  const title = text(params.p_title)
  const description = text(params.p_description)
  const timezone = text(params.p_timezone)
  const method = params.p_method || 'both'
  const coord_system = params.p_coord_system || 'gcj02'
  const location_lat = params.p_lat ?? null
  const location_lng = params.p_lng ?? null
  requireThat(length(title) >= 2 && length(title) <= 60, 'INVALID_TITLE', '活动名称需为 2-60 个字符')
  requireThat(length(description) <= 1000, 'INVALID_DESCRIPTION', '文字说明不能超过 1000 个字符')
  requireThat(['both', 'code', 'qr'].includes(method), 'INVALID_METHOD', '签到方式不合法')
  requireThat(['gcj02', 'wgs84'].includes(coord_system), 'INVALID_COORD_SYSTEM', '坐标系统不合法')
  requireThat(!params.p_require_location || (location_lat !== null && location_lng !== null),
    'LOCATION_REQUIRED', '启用位置校验时必须选择签到地点')
  requireThat((location_lat === null && location_lng === null) ||
    (within(location_lat, 90) && within(location_lng, 180)), 'INVALID_LOCATION', '签到地点坐标不合法')
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    })
  } catch (_) {
    fail('INVALID_TIMEZONE', '时区不合法')
  }
  const start = local ? zonedTime(params.p_start_local, formatter) : Date.parse(text(params.p_start_at))
  const end = local ? zonedTime(params.p_end_local, formatter) : Date.parse(text(params.p_end_at))
  requireThat(Number.isFinite(start) && Number.isFinite(end), 'INVALID_TIME', '开始/结束时间不合法')
  requireThat(start >= ctx.now - FIVE_MINUTES, 'START_IN_PAST', '开始时间不能早于当前时间')
  requireThat(end > start && end - start <= 7 * DAY, 'INVALID_TIME', '签到时长须大于零且最多 7 天')
  const eventId = id()
  const start_at = iso(start)
  const end_at = iso(end)
  return ctx.db.transaction(async db => {
    const row = await ownedClass(db, params.p_class_id, ctx.uid)
    const now = Date.now()
    await consumeTicket(db, ctx, 'create_checkin', params.p_captcha_ticket, false)
    await db.add('events', eventId, {
      class_id: row._id, creator_id: ctx.uid, title, description, timezone, start_at, end_at,
      location_name: text(params.p_location_name).slice(0, 100) || null,
      location_address: text(params.p_location_address).slice(0, 200) || null,
      location_lat, location_lng, coord_system, geofence_radius_m: 1000,
      is_surprise: params.p_is_surprise === true, require_location: params.p_require_location === true,
      require_device: params.p_require_device === true, method, slice_seconds: SLICE_MS / 1000,
      allow_previous_slice: true, created_at: iso(now), roster_at: Math.max(start, now), deleted: false, secret: token()
    })
    await db.update('classes', row._id, { version: row.version + 1 })
    await audit(db, ctx, 'create_checkin_event', 'checkin_event', eventId, { title })
    return { event_id: eventId, start_at, end_at }
  })
}

async function listEvents(ctx, scope, filter) {
  const memberships = await ctx.db.find('members', { user_id: ctx.uid })
  const classes = await ctx.db.byIds('classes', memberships.map(member => member.class_id))
  const ownRecords = await ctx.db.find('records', { user_id: ctx.uid })
  const stored = new Map(ownRecords.map(record => [record.event_id, record]))
  const items = []
  for (const member of memberships) {
    const row = classes.get(member.class_id)
    if (!row || row.deleted || (scope === 'created' && member.role !== 'owner')) continue
    const events = await ctx.db.find('events', { class_id: row._id, deleted: false })
    const relevant = events.filter(event => {
      const status = eventState(event, ctx.now)
      if (status === 'upcoming' && event.is_surprise && scope !== 'created') return false
      const canManage = event.creator_id === ctx.uid
      if (!canManage && !activeAt(member, event.roster_at)) return false
      if (scope === 'created') return canManage
      if (scope === 'participated') return !canManage
      return scope === 'home' || status === scope
    })
    if (!relevant.length) continue
    const [roster, classRecords] = await Promise.all([
      ctx.db.find('members', { class_id: row._id, role: 'member' }),
      ctx.db.find('records', { class_id: row._id })
    ])
    const byId = new Map(classRecords.map(record => [record._id, record]))
    for (const event of relevant) {
      const ownRecord = event.creator_id === ctx.uid ? null : buildRecord(event, ctx.uid, stored.get(event._id))
      if (scope === 'ended' && filter !== 'all' && ownRecord?.status !== filter) continue
      const counts = statusCounts(roster.filter(member => activeAt(member, event.roster_at))
        .map(member => buildRecord(event, member.user_id, byId.get(key(event._id, member.user_id)))))
      items.push({
        ...eventOutput(event, row), status: eventState(event, ctx.now),
        my_status: ownRecord?.status || null, my_method: ownRecord?.method || null,
        my_is_late_slice: ownRecord?.is_late_slice || false, my_checked_in_at: ownRecord?.checked_in_at || null,
        my_appeal_status: ownRecord?.appeals.at(-1)?.status || null, my_appeal_count: ownRecord?.appeals.length || 0,
        present_count: counts.present, makeup_count: counts.makeup, absent_count: counts.absent
      })
    }
  }
  return items
}

function sortEvents(items, scope) {
  if (scope === 'upcoming') return items.sort((a, b) => a.start_at.localeCompare(b.start_at))
  if (scope === 'active') return items.sort((a, b) => a.end_at.localeCompare(b.end_at))
  return items.sort((a, b) => b.start_at.localeCompare(a.start_at))
}

const methods = {
  create_checkin_event_verified: (ctx, params) => createEvent(ctx, params, false),
  create_checkin_event_local_verified: (ctx, params) => createEvent(ctx, params, true),
  async get_home_checkins(ctx) {
    const items = await listEvents(ctx, 'home', 'all')
    return Object.fromEntries(['active', 'upcoming', 'ended'].map(scope =>
      [scope, sortEvents(items.filter(item => item.status === scope), scope)]
    ))
  },
  async list_checkin_events(ctx, { p_scope, p_status = 'all' }) {
    requireThat(['active', 'upcoming', 'ended', 'participated', 'created'].includes(p_scope),
      'INVALID_SCOPE', '查询范围不合法')
    requireThat(['all', 'present', 'absent'].includes(p_status), 'INVALID_STATUS', '筛选状态不合法')
    return { items: sortEvents(await listEvents(ctx, p_scope, p_status), p_scope) }
  },
  async get_checkin_event(ctx, { p_event_id }) {
    const { event, classRow } = await visibleEvent(ctx.db, p_event_id)
    const can_manage = event.creator_id === ctx.uid
    let record = null
    if (!can_manage) {
      const member = await ctx.db.get('members', key(event.class_id, ctx.uid))
      requireThat(activeAt(member, event.roster_at) &&
        (!event.is_surprise || eventState(event, ctx.now) !== 'upcoming'), 'FORBIDDEN', '活动不存在或暂不可见')
      const stored = await ctx.db.get('records', key(event._id, ctx.uid))
      record = buildRecord(event, ctx.uid, stored)
    }
    const code = can_manage && ctx.now >= Date.parse(event.start_at) - FIVE_MINUTES && ctx.now <= Date.parse(event.end_at)
      ? { ok: true, data: codeData(event, ctx.now) } : null
    return {
      event: eventOutput(event, classRow), can_manage, code_data: code, my_record: recordOutput(record),
      my_appeal_status: record?.appeals.at(-1)?.status || null, my_appeals: record?.appeals || [],
      server_now: iso(ctx.now), counts: statusCounts(await allRecords(ctx.db, event))
    }
  },
  async get_checkin_code(ctx, { p_event_id }) {
    const { event } = await ownedEvent(ctx.db, p_event_id, ctx.uid)
    return codeData(event, ctx.now)
  },
  async end_checkin_event(ctx, { p_event_id }) {
    return ctx.db.transaction(async db => {
      const { event } = await ownedEvent(db, p_event_id, ctx.uid)
      const now = Date.now()
      requireThat(now > Date.parse(event.start_at), 'NOT_STARTED', '签到还未开始，不能提前结束')
      requireThat(now < Date.parse(event.end_at), 'ALREADY_ENDED', '签到已经结束')
      const end_at = iso(now)
      await db.update('events', event._id, { end_at })
      await audit(db, ctx, 'end_checkin_event', 'checkin_event', event._id, { end_at })
      return { event_id: event._id, end_at, status: 'ended' }
    })
  },
  async delete_checkin_event(ctx, { p_event_id }) {
    return ctx.db.transaction(async db => {
      const { event } = await ownedEvent(db, p_event_id, ctx.uid)
      requireThat(Date.now() < Date.parse(event.start_at), 'ALREADY_STARTED', '已开始的签到不能删除')
      await db.remove('events', event._id)
      await audit(db, ctx, 'delete_checkin_event', 'checkin_event', event._id)
      return { deleted: true }
    })
  },
  async set_event_participant_status(ctx, { p_event_id, p_user_id, p_present, p_note }) {
    requireThat(typeof p_user_id === 'string' && typeof p_present === 'boolean',
      'INVALID_STATUS', '签到状态和成员不能为空')
    const note = text(p_note)
    requireThat(length(note) <= 500, 'INVALID_NOTE', '备注不能超过 500 个字符')
    return ctx.db.transaction(async db => {
      const { event } = await ownedEvent(db, p_event_id, ctx.uid)
      const now = Date.now()
      requireThat(now >= Date.parse(event.start_at), 'NOT_STARTED', '签到还未开始，不能修改签到状态')
      const { record, stored } = await eligibleRecord(db, event, p_user_id)
      Object.assign(record, statusFields(now, p_present))
      await putRecord(db, record, stored)
      await audit(db, ctx, p_present ? 'manual_set_present' : 'manual_set_absent', 'checkin_record', record._id, { note })
      return { record_id: record._id, user_id: p_user_id, status: record.status, method: record.method }
    })
  },
  async submit_checkin(ctx, params) {
    const method = text(params.p_method)
    const codeHash = text(params.p_code_hash).toLowerCase()
    const device = text(params.p_device_id).slice(0, 128)
    requireThat(['code', 'qr'].includes(method), 'INVALID_METHOD', '签到方式不合法')
    requireThat(/^[0-9a-f]{64}$/.test(codeHash), 'INVALID_CODE', '签到码格式不正确')
    const result = await ctx.db.transaction(async db => {
      const { event } = await visibleEvent(db, params.p_event_id)
      const { record, stored } = await eligibleRecord(db, event, ctx.uid)
      const now = Date.now()
      const state = eventState(event, now)
      requireThat(record.status !== 'present', 'ALREADY_CHECKED_IN', '你已签到，无需重复提交')
      requireThat(state !== 'upcoming', 'NOT_STARTED', '签到还未开始')
      requireThat(state !== 'ended', 'ENDED', '签到已结束')
      requireThat(event.method === 'both' || event.method === method, 'METHOD_NOT_ALLOWED', '本场不支持此签到方式')
      requireThat(!event.require_device || device, 'DEVICE_REQUIRED', '本场签到要求绑定设备')
      requireThat(!event.require_device || !record.device_id || record.device_id === device,
        'DEVICE_MISMATCH', '本场签到已绑定其他设备，不能换机签到')
      const latitude = params.p_lat ?? null
      const longitude = params.p_lng ?? null
      const validLocation = within(latitude, 90) && within(longitude, 180)
      requireThat(!event.require_location || validLocation, 'LOCATION_REQUIRED', '本场签到要求获取设备位置')
      const distance_m = event.require_location ? distance(event.location_lat, event.location_lng, latitude, longitude) : null
      requireThat(distance_m === null || distance_m <= event.geofence_radius_m,
        'OUT_OF_RANGE', `你距离签到点约 ${Math.round(distance_m)} 米，需在 ${event.geofence_radius_m} 米内`)
      const slice = Math.floor(now / SLICE_MS)
      const failures = record.failed_slice === slice ? record.failures : 0
      requireThat(failures < 5, 'TOO_MANY_ATTEMPTS', '尝试次数过多，请等待下一轮验证码')
      const expected = index => hash(`${event._id}|${ctx.uid}|${rotatingCode(event, index)}`)
      const current = codeHash === expected(slice)
      const previous = !current && event.allow_previous_slice && codeHash === expected(slice - 1)
      if (!current && !previous) {
        await putRecord(db, { ...record, failed_slice: slice, failures: failures + 1 }, stored)
        return null
      }
      const checked_in_at = iso(now)
      await putRecord(db, {
        ...record, status: 'present', method, is_late_slice: previous, slice_index: previous ? slice - 1 : slice,
        code_hash: codeHash, checked_in_at, distance_m, latitude: validLocation ? latitude : null,
        longitude: validLocation ? longitude : null, device_id: record.device_id || device || null,
        device_label: text(params.p_device_label).slice(0, 100) || null
      }, stored)
      return { record_id: record._id, status: 'present', method, is_late_slice: previous, checked_in_at, distance_m }
    })
    requireThat(result, 'CODE_EXPIRED', '验证码错误或已过期，请重新输入')
    return result
  },
  async get_event_results(ctx, { p_event_id }) {
    const { event, classRow } = await ownedEvent(ctx.db, p_event_id, ctx.uid)
    const records = await allRecords(ctx.db, event)
    const profiles = await people(ctx.db, records.map(row => row.user_id))
    const items = records.filter(record => profiles.has(record.user_id)).map(record => ({
      ...profiles.get(record.user_id), record_id: record._id, status: record.status, method: record.method,
      is_late_slice: record.is_late_slice, checked_in_at: record.checked_in_at, distance_m: record.distance_m,
      device_label: record.device_label, appeal_status: record.appeals.at(-1)?.status || null,
      appeal_count: record.appeals.length
    }))
    return {
      event: eventOutput(event, classRow), counts: statusCounts(records),
      items: items.sort((a, b) => a.student_id.localeCompare(b.student_id))
    }
  }
}

module.exports = {
  methods, recordKeyPattern, visibleEvent, eventOutput, recordOutput, eligibleRecord,
  putRecord, buildRecord, statusFields, statusCounts
}
