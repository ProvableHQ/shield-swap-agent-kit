import { DatabaseSync } from 'node:sqlite'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

export const encode = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { $integer: String(v) } : v)
export const decode = value => JSON.parse(value, (_, v) => v && typeof v === 'object' && Object.keys(v).length === 1 && typeof v.$integer === 'string' ? BigInt(v.$integer) : v)
const canonical = value => {
  if (typeof value === 'bigint') return { $integer: String(value) }
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

export function database(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if (!existsSync(path)) {
    try { closeSync(openSync(path, 'wx', 0o600)) } catch (error) { if (error.code !== 'EEXIST') throw error }
  }
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || stat.mode & 0o077) throw Error('Operation storage must be private (mode 0600) and not a symlink')
  const db = new DatabaseSync(path)
  db.exec('PRAGMA busy_timeout=10000; PRAGMA synchronous=FULL;')
  return db
}

export function atomic(db, body) {
  db.exec('BEGIN IMMEDIATE')
  try { const result = body(); db.exec('COMMIT'); return result }
  catch (error) { db.exec('ROLLBACK'); throw error }
}

export class OperationStore {
  constructor(path) {
    this.db = database(path)
    this.db.exec('CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, scope TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL)')
  }
  close() { this.db.close() }
  get(id) {
    const row = this.db.prepare('SELECT * FROM operations WHERE id=?').get(id)
    return row ? { ...decode(row.data), id: row.id, scope: row.scope, intent: decode(row.intent), status: row.status } : undefined
  }
  begin(id, scope, intent, capacity) {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(id)) throw Error('Supply a stable application request id')
    return atomic(this.db, () => {
      const row = this.get(id)
      if (row) {
        if (row.scope !== scope || encode(canonical(row.intent)) !== encode(canonical(intent))) throw Error('Operation id cannot change its account, network, or trade intent')
        return [row, false]
      }
      const count = this.db.prepare("SELECT COUNT(*) AS count FROM operations WHERE scope=? AND status NOT IN ('complete','failed')").get(scope).count
      if (count >= capacity) throw Error('Account operation capacity reached; finish or reconcile existing operations')
      this.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?)').run(id, scope, encode(intent), 'submitting', '{}')
      return [this.get(id), true]
    })
  }
  transition(id, expected, status, patch = {}) {
    return atomic(this.db, () => {
      const row = this.db.prepare('SELECT * FROM operations WHERE id=?').get(id)
      if (!row) throw Error('Unknown operation')
      if (row.status !== expected) return false
      this.db.prepare('UPDATE operations SET status=?,data=? WHERE id=?').run(status, encode({ ...decode(row.data), ...patch }), id)
      return true
    })
  }
}
