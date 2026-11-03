import { AsyncLocalStorage } from "node:async_hooks";

/** Propagates a durable operation owner through SDK record reservations. */
export const operationContext = new AsyncLocalStorage<{ operationId: string; submitted?: () => void }>();
/** Limits SDK reconciliation to entries whose owner is exclusively locked. */
export const journalContext = new AsyncLocalStorage<{ owner?: string }>();

/** Observes durable inventory proofs before either SDK submission path broadcasts. */
export const inventoryContext = new AsyncLocalStorage<{ prepared(transactionId: string): void }>();
