import type { RecordInventoryStore, RecordSpend } from '@provablehq/veil-core'
export class InventoryStore implements RecordInventoryStore {
  constructor(path: string)
  list(scope: string): Promise<RecordSpend[]>
  acquire(entry: Omit<RecordSpend, 'id'>): Promise<RecordSpend | undefined>
  update(scope: string, id: string, patch: Parameters<RecordInventoryStore['update']>[2]): Promise<void>
  close(): void
}
