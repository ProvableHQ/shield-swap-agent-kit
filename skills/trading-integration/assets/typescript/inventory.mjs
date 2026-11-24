import { hostname } from 'node:os'
import { atomic, database } from './operations.mjs'

/** Durable adapter for Veil's public RecordInventoryStore interface. */
export class InventoryStore {
  constructor(path) {
    this.db = database(path)
    this.db.exec('CREATE TABLE IF NOT EXISTS record_spends (id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, data TEXT NOT NULL, pid INTEGER NOT NULL, host TEXT NOT NULL); CREATE INDEX IF NOT EXISTS record_spends_scope ON record_spends(scope)')
  }
  close() { this.db.close() }
  rows(scope) {
    return this.db.prepare('SELECT id,data FROM record_spends WHERE scope=? ORDER BY id').all(scope).map(row => ({ ...JSON.parse(row.data), id: String(row.id) }))
  }
  async list(scope) { return this.rows(scope) }
  async acquire(entry) {
    return atomic(this.db, () => {
      if (new Set(entry.records).size !== entry.records.length) throw Error('Duplicate record inputs')
      const held = new Set(this.rows(entry.scope).flatMap(row => row.status === 'cancelled' ? [] : row.status === 'rejected' ? (row.feeRecordId ? [row.feeRecordId] : []) : row.records))
      if (entry.records.some(id => held.has(id))) return undefined
      const result = this.db.prepare('INSERT INTO record_spends(scope,data,pid,host) VALUES(?,?,?,?)').run(entry.scope, JSON.stringify(entry), process.pid, hostname())
      const saved = { ...entry, id: String(result.lastInsertRowid) }
      this.db.prepare('UPDATE record_spends SET data=? WHERE id=?').run(JSON.stringify(saved), saved.id)
      return saved
    })
  }
  async update(scope, id, patch) {
    atomic(this.db, () => {
      const row = this.db.prepare('SELECT data FROM record_spends WHERE scope=? AND id=?').get(scope, id)
      if (!row) throw Error('Unknown record reservation')
      // JSON omits an explicitly undefined field, as required by the SDK contract.
      this.db.prepare('UPDATE record_spends SET data=? WHERE scope=? AND id=?').run(JSON.stringify({ ...JSON.parse(row.data), ...patch }), scope, id)
    })
  }
}
