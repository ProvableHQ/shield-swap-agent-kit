import { OperationStore } from './operations.mjs'

const errorName = error => typeof error?.name === 'string' ? error.name : 'UnknownError'

export function validateOffer(offer, scope) {
  if (offer.scope !== scope) throw Error('Quote scope does not match the account and network')
  const age = Date.now() - offer.quotedAt
  if (!Number.isFinite(age) || !Number.isFinite(offer.maxAgeMs) || offer.maxAgeMs <= 0 || offer.maxAgeMs > 60_000 || age < 0 || age >= offer.maxAgeMs) throw Error('Quote expired or has an invalid timestamp')
}

export class Trading {
  constructor(venue, path, { maxInFlight = 1, executionEnabled = false } = {}) {
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1 || maxInFlight > 32) throw Error('maxInFlight must be 1-32')
    this.venue = venue
    this.store = new OperationStore(path)
    this.maxInFlight = maxInFlight
    this.executionEnabled = executionEnabled
  }
  close() { this.store.close() }
  requireExecution() { if (!this.executionEnabled) throw Error('Enable execution after account, network, amounts and limits are authorized') }
  status(id) {
    const row = this.store.get(id)
    if (row && row.scope !== this.venue.scope) throw Error('Operation scope does not match this account')
    return row
  }
  async submit(id, offer) {
    this.requireExecution()
    if (!this.status(id)) validateOffer(offer, this.venue.scope)
    const [row, created] = this.store.begin(id, offer.scope, offer.native, this.maxInFlight)
    if (!created) return row
    try {
      const handle = await this.venue.submit(offer.native)
      this.store.transition(id, 'submitting', 'submitted', { handle })
    } catch (error) { this.store.transition(id, 'submitting', 'submission_unknown', { errorType: errorName(error) }) }
    return this.status(id)
  }
  async claim(id) {
    this.requireExecution()
    const row = this.status(id)
    if (!row) throw Error('Unknown operation')
    if (row.status !== 'submitted' || !await this.venue.ready(row.handle)) return row
    if (!this.store.transition(id, 'submitted', 'claiming')) return this.status(id)
    try {
      const result = await this.venue.claim(row.handle)
      this.store.transition(id, 'claiming', 'complete', { result })
    } catch (error) { this.store.transition(id, 'claiming', 'claim_unknown', { errorType: errorName(error) }) }
    return this.status(id)
  }
  async execute(id, offer) {
    const row = await this.submit(id, offer)
    return row.status === 'submitted' ? this.claim(id) : row
  }
  async executeMany(requests) {
    const results = new Array(requests.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(this.maxInFlight, requests.length) }, async () => {
      while (next < requests.length) {
        const index = next++
        try { results[index] = await this.execute(...requests[index]) }
        catch (error) {
          let saved
          try { saved = this.status(requests[index][0]) } catch { /* Never expose another account's state. */ }
          results[index] = { ...(saved ?? { id: requests[index][0], status: 'not_started' }), errorType: errorName(error) }
        }
      }
    }))
    return results
  }
}
