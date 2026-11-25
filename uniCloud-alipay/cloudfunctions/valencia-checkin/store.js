'use strict'

const crypto = require('node:crypto')

function fail(code, message) {
  throw Object.assign(new Error(message), { businessCode: code })
}

function requireThat(condition, code, message) {
  if (!condition) fail(code, message)
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

const length = value => Array.from(value).length
const id = () => crypto.randomUUID()
const token = () => crypto.randomBytes(32).toString('hex')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const iso = ms => new Date(ms).toISOString()
const key = (left, right) => `${left}:${right}`

function publicDoc(row) {
  if (!row) return null
  const { _id, ...fields } = row
  return { id: _id, ...fields }
}

function store(database, source = database) {
  const collection = name => source.collection(`vu_${name}`)
  const doc = (name, key) => collection(name).doc(key)

  return {
    command: database.command,
    async get(name, key) {
      if (typeof key !== 'string' || !key || key.length > 128) return null
      const { data } = await doc(name, key).get()
      return (Array.isArray(data) ? data[0] : data) || null
    },
    async find(name, filter) {
      const rows = []
      const size = 100
      let lastId
      for (;;) {
        const conditions = lastId ? { ...filter, _id: database.command.gt(lastId) } : filter
        const { data } = await collection(name).where(conditions).orderBy('_id', 'asc').limit(size).get()
        rows.push(...data)
        if (data.length < size) return rows
        lastId = data[data.length - 1]._id
      }
    },
    async byIds(name, ids) {
      const unique = [...new Set(ids.filter(Boolean))]
      const rows = new Map()
      for (let start = 0; start < unique.length; start += 100) {
        const batch = await this.find(name, { _id: database.command.in(unique.slice(start, start + 100)) })
        for (const row of batch) rows.set(row._id, row)
      }
      return rows
    },
    add(name, key, fields) {
      return collection(name).add({ ...fields, _id: key })
    },
    update(name, key, fields) {
      return doc(name, key).update(fields)
    },
    remove(name, key) {
      return doc(name, key).remove()
    },
    removeWhere(name, filter) {
      return collection(name).where(filter).remove()
    },
    async transaction(work) {
      for (let attempt = 0; ; attempt++) {
        const transaction = await database.startTransaction()
        try {
          const result = await work(store(database, transaction))
          await transaction.commit()
          return result
        } catch (error) {
          try { await transaction.rollback() } catch (_) {}
          const writeConflict = /write.?conflict|transaction.?conflict|conflicting operation|duplicate.?key|E11000/i.test(
            `${error.code} ${error.errCode} ${error.message}`
          )
          if (!writeConflict || attempt === 3) throw error
          await new Promise(resolve => setTimeout(resolve, crypto.randomInt(20, 65) * (attempt + 1)))
        }
      }
    }
  }
}

module.exports = { store, fail, requireThat, text, length, id, token, hash, iso, key, publicDoc }
