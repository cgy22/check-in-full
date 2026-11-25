'use strict'

const { requireThat, text, length, id, iso, publicDoc } = require('./store')
const { audit, consumeTicket, people } = require('./accounts')
const {
  recordKeyPattern, visibleEvent, eventOutput, recordOutput, eligibleRecord, putRecord, buildRecord, statusFields
} = require('./events')

async function updateAppeals(db, event, record, stored, appeal, ctx) {
  const index = record.appeals.findIndex(item => item.id === appeal.id)
  const appeals = record.appeals.slice()
  if (index === -1) appeals.push(appeal)
  else if (ctx.action === 'withdraw_appeal') appeals.splice(index, 1)
  else appeals[index] = appeal
  const { id: appealId, ...fields } = appeal
  if (ctx.action === 'withdraw_appeal') {
    await db.remove('appeals', appealId)
  } else if (index === -1) {
    await db.add('appeals', appealId, {
      ...fields, record_id: record._id, event_id: event._id, class_id: event.class_id,
      creator_id: event.creator_id, user_id: record.user_id
    })
  } else {
    await db.update('appeals', appealId, fields)
  }
  await putRecord(db, { ...record, appeals }, stored)
  await audit(db, ctx, ctx.action, 'appeal', appealId, { record_id: record._id })
  return appeals
}

async function listAppeals(ctx, status, received) {
  requireThat(['all', 'pending', 'approved', 'rejected'].includes(status), 'INVALID_STATUS', '筛选状态不合法')
  const filter = received ? { creator_id: ctx.uid } : { user_id: ctx.uid }
  if (status !== 'all') filter.status = status
  const appeals = await ctx.db.find('appeals', filter)
  const [events, classes, records, profiles] = await Promise.all([
    ctx.db.byIds('events', appeals.map(appeal => appeal.event_id)),
    ctx.db.byIds('classes', appeals.map(appeal => appeal.class_id)),
    ctx.db.byIds('records', appeals.map(appeal => appeal.record_id)),
    received ? people(ctx.db, appeals.map(appeal => appeal.user_id)) : null
  ])
  const items = []
  for (const appeal of appeals) {
    const event = events.get(appeal.event_id)
    const row = classes.get(appeal.class_id)
    if (!row || row.deleted || !event || event.deleted) continue
    if (received && !profiles.has(appeal.user_id)) continue
    const record = buildRecord(event, appeal.user_id, records.get(appeal.record_id))
    items.push({
      id: appeal._id, status: appeal.status, attempt_no: appeal.attempt_no, reason: appeal.reason,
      created_at: appeal.created_at, reviewed_at: appeal.reviewed_at, review_note: appeal.review_note,
      event_id: event._id, event_title: event.title, event_start_at: event.start_at, event_end_at: event.end_at,
      event_timezone: event.timezone, class_name: row.name, record_id: appeal.record_id,
      record_status: record.status, record_method: record.method, ...(profiles?.get(appeal.user_id) || {})
    })
  }
  items.sort(received
    ? (a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.created_at.localeCompare(b.created_at)
    : (a, b) => b.created_at.localeCompare(a.created_at))
  return { items }
}

const methods = {
  async apply_makeup(ctx, { p_record_id, p_reason, p_captcha_ticket }) {
    const match = recordKeyPattern.exec(text(p_record_id))
    requireThat(match && match[2] === ctx.uid, 'FORBIDDEN', '你没有权限申请该次补签')
    const reason = text(p_reason)
    requireThat(length(reason) >= 10 && length(reason) <= 500, 'INVALID_REASON', '申请理由需为 10-500 个字符')
    const appealId = id()
    return ctx.db.transaction(async db => {
      const { event } = await visibleEvent(db, match[1])
      requireThat(ctx.now > Date.parse(event.end_at), 'EVENT_NOT_ENDED', '签到还未结束，不能申请补签')
      const { record, stored } = await eligibleRecord(db, event, ctx.uid)
      requireThat(record.status !== 'present', 'ALREADY_PRESENT', '你已签到，无需补签')
      requireThat(!record.appeals.some(item => item.status === 'pending'), 'PENDING_EXISTS', '已有待审批的补签申请')
      requireThat(!record.appeals.some(item => item.status === 'approved'), 'ALREADY_APPROVED', '补签已通过')
      requireThat(record.appeals.length < 3, 'LIMIT_REACHED', '补签机会已用完')
      await consumeTicket(db, ctx, 'appeal', p_captcha_ticket, false)
      const attempt_no = record.appeals.length + 1
      await updateAppeals(db, event, record, stored, {
        id: appealId, status: 'pending', attempt_no, reason, created_at: iso(ctx.now), reviewed_at: null, review_note: null
      }, { ...ctx, action: 'apply_makeup' })
      return { appeal_id: appealId, attempt_no, status: 'pending' }
    })
  },
  list_received_appeals: (ctx, { p_status = 'pending' }) => listAppeals(ctx, p_status, true),
  list_my_appeals: (ctx, { p_status = 'all' }) => listAppeals(ctx, p_status, false),
  async get_appeal_detail(ctx, { p_appeal_id }) {
    const appeal = await ctx.db.get('appeals', p_appeal_id)
    requireThat(appeal && (appeal.user_id === ctx.uid || appeal.creator_id === ctx.uid),
      'FORBIDDEN', '无权查看该补签申请')
    const { event, classRow } = await visibleEvent(ctx.db, appeal.event_id)
    const [record, profiles] = await Promise.all([
      ctx.db.get('records', appeal.record_id), people(ctx.db, [appeal.user_id])
    ])
    requireThat(record && profiles.has(appeal.user_id), 'NOT_FOUND', '补签申请不存在')
    const { class_id, creator_id, ...fields } = appeal
    return {
      appeal: publicDoc(fields), event: eventOutput(event, classRow),
      applicant: profiles.get(appeal.user_id), record: recordOutput(record), history: record.appeals
    }
  },
  async review_appeal(ctx, { p_appeal_id, p_approve, p_note }) {
    requireThat(typeof p_approve === 'boolean', 'INVALID_STATUS', '请选择审批结果')
    const review_note = text(p_note) || null
    requireThat(length(review_note || '') <= 500, 'INVALID_NOTE', '审批备注不能超过 500 个字符')
    return ctx.db.transaction(async db => {
      const appeal = await db.get('appeals', p_appeal_id)
      requireThat(appeal, 'NOT_FOUND', '补签申请不存在')
      requireThat(appeal.creator_id === ctx.uid, 'FORBIDDEN', '只有活动创建者可以审批')
      requireThat(appeal.status === 'pending', 'ALREADY_REVIEWED', '该申请已处理')
      const { event } = await visibleEvent(db, appeal.event_id)
      const { record, stored } = await eligibleRecord(db, event, appeal.user_id)
      const status = p_approve ? 'approved' : 'rejected'
      const updated = {
        id: appeal._id, attempt_no: appeal.attempt_no, reason: appeal.reason, created_at: appeal.created_at,
        status, review_note, reviewed_at: iso(ctx.now), reviewed_by: ctx.uid
      }
      if (p_approve) Object.assign(record, statusFields(ctx.now, true))
      const appeals = await updateAppeals(db, event, record, stored, updated, {
        ...ctx, action: p_approve ? 'approve_appeal' : 'reject_appeal'
      })
      return {
        appeal_id: appeal._id, status, record_status: record.status, attempts_used: appeals.length,
        attempts_remaining: 3 - appeals.length, rejected_count: appeals.filter(item => item.status === 'rejected').length
      }
    })
  },
  async withdraw_appeal(ctx, { p_appeal_id }) {
    return ctx.db.transaction(async db => {
      const appeal = await db.get('appeals', p_appeal_id)
      requireThat(appeal && appeal.user_id === ctx.uid && appeal.status === 'pending',
        'NOT_FOUND', '没有可撤回的待审批申请')
      const { event } = await visibleEvent(db, appeal.event_id)
      const { record, stored } = await eligibleRecord(db, event, ctx.uid)
      await updateAppeals(db, event, record, stored, { id: appeal._id }, {
        ...ctx, action: 'withdraw_appeal'
      })
      return { withdrawn: true }
    })
  }
}

module.exports = { methods }
