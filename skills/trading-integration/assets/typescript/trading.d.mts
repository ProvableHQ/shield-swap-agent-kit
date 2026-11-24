export interface Offer<N> { scope: string; native: N; quotedAt: number; maxAgeMs: number }
export interface Venue<N, H, R> {
  scope: string
  submit(native: N): Promise<H>
  ready(handle: H): Promise<boolean>
  claim(handle: H): Promise<R>
}
export interface Operation<H, R> {
  id: string
  scope: string
  status: string
  handle?: H
  result?: R
  errorType?: string
}
export function validateOffer<N>(offer: Offer<N>, scope: string): void
export class Trading<N, H, R> {
  constructor(venue: Venue<N, H, R>, path: string, options?: { maxInFlight?: number; executionEnabled?: boolean })
  executionEnabled: boolean
  status(id: string): Operation<H, R> | undefined
  submit(id: string, offer: Offer<N>): Promise<Operation<H, R>>
  claim(id: string): Promise<Operation<H, R>>
  execute(id: string, offer: Offer<N>): Promise<Operation<H, R>>
  executeMany(requests: [string, Offer<N>][]): Promise<Operation<H, R>[]>
  close(): void
}
