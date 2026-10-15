// Offline SDK boundary double for the installed-server recovery smoke test.
// The production CLI, store, runtime, and SDK executeContract remain unchanged.
import { registerHooks } from "node:module";
import { appendFileSync, readFileSync } from "node:fs";
import { executeContract, TransactionTimeoutError } from "@provablehq/veil-core";

if (!new URL(import.meta.url).search) {
  registerHooks({ resolve(specifier, context, nextResolve) {
    if (["@provablehq/veil-aleo-sdk", "@provablehq/shield-swap-sdk"].includes(specifier)) {
      return { url: new URL("?sdk", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  } });
  globalThis.fetch = async () => { throw new Error("Network access is disabled in the recovery smoke test"); };
}
const control = () => JSON.parse(readFileSync(process.env.RECOVERY_CONTROL, "utf8"));

export async function loadNetwork() {
  const account = { type: "local", address: process.env.RECOVERY_ADDRESS, sign() {} };
  const proving = { mode: "delegated", execute: async () => {
    appendFileSync(process.env.RECOVERY_ATTEMPTS, "submit\n");
    if (control().mode === "timeout") throw new TransactionTimeoutError({ transactionId: "at1claim", timeoutMs: 1 });
    return { transactionId: "at1claim", transitions: [], outputs: [] };
  } };
  const walletClient = { account, proving, extend(actions) { return Object.assign(this, actions(this)); } };
  return { createAleoClient: () => ({ account, walletClient, publicClient: {
    request: async ({ method }) => {
      if (method !== "getConfirmedTransaction") throw new Error("Unexpected RPC method");
      if (control().mode === "rejected") return { status: "rejected", transaction: { id: "at1fee" } };
      throw new Error("Transaction not found");
    },
  } }) };
}
export function shieldSwapActions({ blindedIdentities: identities }) {
  return client => ({
    authenticateShieldSwap: async () => {},
    getUnclaimedSwaps: async () => {
      const records = await identities.load();
      return { swaps: ["one", "two"].filter(swapId => !records.some(r => r.swapId === swapId && r.claim))
        .map(swapId => ({ swapId, claimable: true, handle: { swapId } })), unresolvable: [] };
    },
    reconcileSwapHistory: async () => ({ complete: true, pagesScanned: 1 }),
    claimSwapOutput: async ({ handle }) => {
      const { mode } = control();
      if (mode === "preparation" || (mode === "partial" && handle.swapId === "two")) throw new Error("Simulated preparation failure");
      const result = await executeContract(client, { program: "shield_swap.aleo", function: "claim_swap_output", inputs: [] });
      const records = await identities.load();
      await identities.save([...records, { swapId: handle.swapId, claim: { transactionId: result.transactionId, amountOut: "99", amountRemaining: "1" } }]);
      return { transactionId: result.transactionId, amountOut: 99n, amountRemaining: 1n };
    },
  });
}
