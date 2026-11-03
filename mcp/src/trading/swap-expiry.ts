import { findTransitionId, getBlockNumber, getCode, parseFuture, type RecordSpend } from "@provablehq/veil-core";
import { releaseExpiredSwap, type OwnedRecordSpend } from "./inventory";
import { checkRecovery } from "./recovery-context";
import type { AleoSession } from "./session";
import type { TradingStore } from "./store";
import type { Operation, SavedQuote } from "./types";

// The deadline comes from the proved finalize arguments, not the quote clock or
// a newly calculated SDK deadline. Unsupported/opaque transactions stay held.
function swapEvidence(entry: RecordSpend, program: string) {
  const tx = entry.transaction;
  if (entry.accountType !== "local" || !tx || tx.id !== entry.transactionId || tx.type !== "execute") return;
  const transitions = tx.execution?.transitions ?? [];
  const swaps = transitions.filter(t => t.program === program && ["swap", "swap_multi_hop"].includes(t.function));
  if (swaps.length !== 1) return;
  const swap = swaps[0];
  const futures = (swap.outputs ?? []).filter(o => o.type === "future");
  if (futures.length !== 1 || !futures[0].value) return;
  try {
    const future = parseFuture(futures[0].value);
    if (future.programId !== program || future.function !== swap.function) return;
    const request = future.arguments[1];
    const deadline = request && typeof request === "object" && "deadline" in request ? request.deadline : undefined;
    if (typeof deadline !== "bigint" || deadline < 0n || deadline > 0xffffffffn) return;
    const inputs = transitions.flatMap(t => t.inputs ?? []).filter(i => i.type === "record" || i.type === "record_with_dynamic_id");
    // Check every execution record, including any internal transfer inputs.
    // Private fee inputs live in tx.fee and are deliberately not released here.
    const count = entry.records.filter(id => id !== entry.feeRecordId).length;
    if (!count || inputs.length < count || inputs.some(i => !/^\d+field$/.test(i.id))) return;
    return { deadlineHeight: Number(deadline), function: swap.function, serials: [...new Set(inputs.map(i => i.id))] };
  } catch { return; }
}

/** Accept only a visible, unconditional guard on the proved request argument. */
function enforcesDeadline(source: string, program: string, fn: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (!code.includes(`program ${program};`)) return false;
  const body = code.split(`finalize ${fn}:`);
  if (body.length !== 2) return false;
  const instructions = body[1].split(/\n\s*(?:function|finalize|closure|constructor|mapping|struct|record)\b/)[0]
    .split(";").map(line => line.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!instructions.includes(`input r1 as ${fn === "swap" ? "SwapRequest" : "SwapMultiHopRequest"}.public`)) return false;
  const guard = instructions.findIndex(line => /^lte block\.height r1\.deadline into r\d+$/.test(line));
  if (guard < 0) return false;
  const result = instructions[guard].split(" ").at(-1);
  if (instructions[guard + 1] !== `assert.eq ${result} true`) return false;
  const prefix = instructions.slice(0, guard);
  // A branch before the check must land before it as well. Reject unfamiliar
  // control flow and writes to the request register, rather than guessing.
  return prefix.every(line => {
    if (/\binto r1(?:\W|$)/.test(line)) return false;
    if (line.startsWith("branch.")) {
      const match = /^branch\.(?:eq|neq) \S+ \S+ to (\w+)$/.exec(line);
      return Boolean(match && prefix.includes(`position ${match[1]}`));
    }
    return /^(?:input|await|position|assert\.(?:eq|neq)|contains|get(?:\.or_use)?|not|is\.(?:eq|neq)|and|or|add|sub|mul|div|ternary|cast)\s/.test(line);
  });
}

function isMissingTransition(error: unknown): boolean {
  const response = error as { status?: number; body?: unknown } | null;
  if (response?.status !== 404 || typeof response.body !== "string") return false;
  let body: unknown = response.body.trim();
  try { body = JSON.parse(response.body); } catch { /* Some nodes return plain text. */ }
  if (body === "Transition not found") return true;
  return body !== null && typeof body === "object" && "message" in body && body.message === "Transition not found" &&
    (!("statusCode" in body) || body.statusCode === 404);
}

/** Called only while the owning operation lock is held. Returns true once the
 * deadline is known to have passed, even if missing evidence prevents release. */
export async function recoverExpiredSwap(store: TradingStore, session: AleoSession, entry: OwnedRecordSpend): Promise<boolean> {
  if (entry.expiryRelease) return true;
  if (!["prepared", "submitted"].includes(entry.status) || !entry.operationId) return false;
  const operation = store.get<Operation>("operation:" + entry.operationId);
  if (!operation?.managedRecords || operation.kind !== "swap") return false;
  const quote = store.get<SavedQuote>("quote:" + operation.quoteId);
  if (!quote || quote.kind !== "swap" || entry.scope !== JSON.stringify(["aleo:" + quote.profile.network, quote.profile.address])) return false;
  const program = quote.profile.program ?? "shield_swap.aleo";
  const evidence = swapEvidence(entry, program);
  if (!evidence) return false;
  const client = session.expiryClient ?? session.publicClient;
  const height = await getBlockNumber(client);
  if (height <= BigInt(evidence.deadlineHeight) || height > 0xffffffffn) return false;
  if (!enforcesDeadline(await getCode(client, { programId: program }), program, evidence.function)) return false;
  for (const serial of evidence.serials) {
    try {
      await findTransitionId(client, { inputOrOutputId: serial });
      return true; // Found or malformed success is never proof of non-spend.
    } catch (error) {
      // A proxy or unsupported route can also return 404. Only the node's
      // explicit missing-transition response is evidence of an unspent serial.
      if (!isMissingTransition(error)) throw error;
    }
  }
  const checkedHeight = await getBlockNumber(client);
  if (checkedHeight < height || checkedHeight > 0xffffffffn) return true;
  checkRecovery();
  releaseExpiredSwap(store, entry, { deadlineHeight: evidence.deadlineHeight, checkedHeight: Number(checkedHeight),
    checkedAt: Date.now(), program, function: evidence.function, releasedRecords: entry.records.filter(id => id !== entry.feeRecordId) });
  return true;
}
