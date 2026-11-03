import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<{ signal: AbortSignal; requests: Set<Promise<unknown>> }>();
export const recoverySignal = (): AbortSignal | undefined => context.getStore()?.signal;
export function checkRecovery(): void { recoverySignal()?.throwIfAborted(); }

/** Own the request lifetime, including response bodies; never detach timed-out work. */
export async function withRecovery<T>(signal: AbortSignal, timeoutMs: number, work: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException("Recovery deadline exceeded", "TimeoutError")), timeoutMs);
  timer.unref();
  const scope = { signal: controller.signal, requests: new Set<Promise<unknown>>() };
  try {
    return await context.run(scope, async () => {
      checkRecovery();
      const result = await work();
      checkRecovery(); // Some SDK status helpers return unknown after catching transport errors.
      return result;
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    // SDK fan-out may reject before its other reads settle. Cancel and drain
    // those reads too, and prohibit any later retry or store access in this scope.
    controller.abort();
    await Promise.allSettled(scope.requests);
  }
}

/** SDK fetch injection for recovery clients. Ordinary execution is unchanged. */
export const recoveryFetch: typeof fetch = async (input, init) => {
  const scope = context.getStore();
  if (!scope) return globalThis.fetch(input, init);
  scope.signal.throwIfAborted();
  const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const signal = callerSignal ? AbortSignal.any([scope.signal, callerSignal]) : scope.signal;
  const request = (async () => {
    const response = await globalThis.fetch(input, { ...init, signal });
    // Keep tracking through body consumption: receiving headers alone does not
    // finish a JSON RPC request. These read clients do not stream responses.
    const body = await response.arrayBuffer();
    signal.throwIfAborted();
    return new Response([101, 204, 205, 304].includes(response.status) ? null : body, response);
  })();
  scope.requests.add(request);
  try { return await request; } finally { scope.requests.delete(request); }
};
