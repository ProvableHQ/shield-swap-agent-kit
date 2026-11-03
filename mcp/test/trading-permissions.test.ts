import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ElicitRequestSchema, type ClientCapabilities, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { createTradingServer } from "../src/trading/server";
import { TradingStore } from "../src/trading/store";
import { TradingRuntime } from "../src/trading/runtime";
import type { Profile, TradingBackend, Summary } from "../src/trading/types";

const body = (result: Summary): Summary => result.structuredContent as Summary;
const policy = { swaps: false, claims: false, bridges: false, inventory: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} };
const proposal = { permissions: { swaps: true, claims: true, bridges: true, inventory: true },
  swapLimits: [{ token: "TOKEN", amount: "1200000" }], bridgeLimits: [{ asset: "USDC", amount: "2000000" }], maxSlippageBps: 50 };
const approved: ElicitResult = { action: "accept", content: { approve: true } };
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

async function fixture(respond: (message: string) => Promise<ElicitResult> = async () => approved,
  capabilities: ClientCapabilities = { elicitation: { form: {} } }) {
  const root = mkdtempSync(join(tmpdir(), "shield-permissions-"));
  const store = new TradingStore(root, "temporary-test-passphrase", true);
  for (const id of ["alice", "bob"]) store.set("profile:" + id, { id, network: "testnet", address: "aleo1" + id,
    key: { type: "env", name: "DO_NOT_ECHO_KEY_REF" }, policy });
  store.set("settings", { defaultProfile: "alice" });
  const unexpected = async () => { throw new Error("Permission changes must not transact or access the network"); };
  const backend: TradingBackend = { read: unexpected, quote: unexpected, execute: unexpected, reconcile: unexpected, resume: unexpected };
  const runtime = new TradingRuntime(store, backend);
  const server = createTradingServer(runtime);
  const client = new Client({ name: "permissions-test", version: "1" }, { capabilities });
  let prompts = 0;
  if (capabilities.elicitation) client.setRequestHandler(ElicitRequestSchema, async request => {
    prompts++;
    assert.equal(request.params.mode, "form");
    assert.doesNotMatch(JSON.stringify(request.params), /DO_NOT_ECHO_KEY_REF/);
    return respond(request.params.message);
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { store, runtime, client, server, root, get prompts() { return prompts; },
    request: (args: Record<string, unknown> = proposal) => client.callTool({ name: "request_permissions", arguments: args }, CallToolResultSchema),
    profile: (id = "alice") => store.get<Profile>("profile:" + id)!,
    close: async () => { await client.close(); await server.close(); store.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("trusted form approval persists exactly the proposed policy for the selected profile", async () => {
  let message = "";
  const f = await fixture(async text => { message = text; return approved; });
  try {
    const result = await f.request({ ...proposal, profileId: "bob" });
    assert.equal(result.isError, false);
    assert.equal(body(result).status, "approved");
    assert.deepEqual(f.profile("alice").policy, policy);
    assert.deepEqual(f.profile("bob").policy, { swaps: true, claims: true, bridges: true, inventory: true,
      maxSlippageBps: 50, swapLimits: { TOKEN: "1200000" }, bridgeLimits: { USDC: "2000000" } });
    assert.match(message, /bob/); assert.match(message, /aleo1bob/); assert.match(message, /testnet/);
    assert.match(message, /persist/i); assert.match(message, /maintenance/i); assert.match(message, /per.operation/i);
    assert.deepEqual(f.store.list("operation:"), []);
    const reopened = new TradingStore(f.root, "temporary-test-passphrase");
    try { assert.deepEqual(reopened.get<Profile>("profile:bob")?.policy, f.profile("bob").policy); }
    finally { reopened.close(); }
  } finally { await f.close(); }
});

for (const response of [{ action: "decline" }, { action: "cancel" }, { action: "accept", content: { approve: false } },
  { action: "accept" }, { action: "accept", content: { approve: "true" } }] as ElicitResult[]) {
  test("non-approval cannot change policy: " + JSON.stringify(response), async () => {
    const f = await fixture(async () => response);
    try { await f.request(); assert.equal(f.prompts, 1); assert.deepEqual(f.profile().policy, policy); }
    finally { await f.close(); }
  });
}

for (const capabilities of [{}, { elicitation: { url: {} } }]) {
  test("a client without confirmation forms gets terminal instructions without granting", async () => {
    const f = await fixture(undefined, capabilities);
    try {
      const result = await f.request();
      assert.equal(body(result).status, "requires_terminal");
      const serialized = JSON.stringify(result.structuredContent);
      assert.match(serialized, /configure/); assert.ok(serialized.includes(f.root)); assert.match(serialized, /alice/);
      assert.equal(f.prompts, 0); assert.deepEqual(f.profile().policy, policy);
    } finally { await f.close(); }
  });
}

test("unchanged requests need no approval and ordinary arguments never bypass confirmation", async () => {
  const f = await fixture();
  try {
    assert.equal(body(await f.request({ permissions: { swaps: false } })).status, "unchanged");
    for (const args of [{}, { profileId: "alice" }, { ...proposal, approved: true }, { ...proposal, privateKey: "secret" },
      { permissions: { unknown: true } }, { swapLimits: [{ token: "TOKEN", amount: "-1" }] },
      { swapLimits: [{ token: "TOKEN", amount: "1" }, { token: "TOKEN", amount: "2" }] }, { maxSlippageBps: 1001 }]) {
      const result = await f.request(args);
      assert.equal((body(result).error as { code: string }).code, "invalid_arguments");
    }
    assert.equal(f.prompts, 0); assert.deepEqual(f.profile().policy, policy);
  } finally { await f.close(); }
});

test("approval cannot overwrite configuration changed while the user was deciding", async () => {
  const shown = deferred<void>(), decision = deferred<ElicitResult>();
  const f = await fixture(async () => { shown.resolve(); return decision.promise; });
  try {
    const request = f.request(); await shown.promise;
    const changed = { ...f.profile(), policy: { ...policy, maxSlippageBps: 25 } };
    f.store.set("profile:alice", changed);
    decision.resolve(approved);
    assert.equal((body(await request).error as { code: string }).code, "profile_changed");
    assert.deepEqual(f.profile(), changed);
  } finally { await f.close(); }
});

test("an operation starting during approval prevents a policy change", async () => {
  const shown = deferred<void>(), decision = deferred<ElicitResult>();
  const f = await fixture(async () => { shown.resolve(); return decision.promise; });
  try {
    const request = f.request(); await shown.promise;
    f.store.set("operation:in-flight", { profileId: "alice", status: "running" });
    decision.resolve(approved);
    assert.equal((body(await request).error as { code: string }).code, "operation_pending");
    assert.deepEqual(f.profile().policy, policy);
  } finally { await f.close(); }
});

for (const disconnect of [false, true]) {
  test(`${disconnect ? "disconnection" : "cancellation"} discards a late approval`, async () => {
    const shown = deferred<void>(), decision = deferred<ElicitResult>();
    const f = await fixture(async () => { shown.resolve(); return decision.promise; });
    try {
      const controller = new AbortController();
      const request = f.client.callTool({ name: "request_permissions", arguments: proposal }, undefined, { signal: controller.signal });
      const rejected = assert.rejects(request);
      await shown.promise;
      if (disconnect) await f.client.close(); else controller.abort();
      await rejected;
      decision.resolve(approved);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(f.profile().policy, policy);
    } finally { await f.close(); }
  });
}

test("simultaneous proposals cannot overwrite each other's approved policy", async () => {
  const shown = deferred<void>(), decision = deferred<ElicitResult>();
  let pending = 0;
  const f = await fixture(async () => { if (++pending === 2) shown.resolve(); return decision.promise; });
  try {
    const first = f.request({ permissions: { claims: true } });
    const second = f.request({ permissions: { inventory: true } });
    await shown.promise; decision.resolve(approved);
    const results = await Promise.all([first, second]);
    assert.equal(results.filter(result => body(result).status === "approved").length, 1);
    assert.notEqual(f.profile().policy.claims, f.profile().policy.inventory);
  } finally { await f.close(); }
});

test("permission errors and setup guide access without opening a prompt or granting unrelated permissions", async () => {
  const f = await fixture();
  try {
    const result = await f.client.callTool({ name: "start_inventory_maintenance", arguments: {
      profileId: "bob", token: "TOKEN", records: 3, minRecordAmount: "1" } }, CallToolResultSchema);
    const error = body(result).error as { code: string; access: { tool: string; profileId: string } };
    assert.equal(error.code, "permission_required");
    assert.equal(error.access.tool, "request_permissions"); assert.equal(error.access.profileId, "bob");
    const setup = await f.client.callTool({ name: "setup", arguments: { journey: "explore_markets" } }, CallToolResultSchema);
    const checks = body(setup).checks as { execution: { permissionTool: string; guidance: string } };
    assert.equal(checks.execution.permissionTool, "request_permissions");
    assert.match(checks.execution.guidance, /read|quot/i);
    assert.equal(f.prompts, 0); assert.deepEqual(f.profile().policy, policy);
  } finally { await f.close(); }
});

test("quote access errors retain their codes and identify the quoted profile, not the default", async () => {
  const f = await fixture();
  try {
    for (const [code, granted] of [
      ["permission_required", policy],
      ["spend_limit", { ...policy, swaps: true }],
      ["slippage_limit", { ...policy, swaps: true, swapLimits: { TOKEN: "1000" } }],
    ] as const) {
      const profile = { ...f.profile("bob"), policy: granted };
      f.store.set("profile:bob", profile);
      f.store.set("quote:q", { id: "q", kind: "swap", profile, scope: f.runtime.scope(profile), createdAt: Date.now(),
        expiresAt: Date.now() + 60000, plan: {}, summary: { tokenIn: "TOKEN", amountIn: "100", slippageBps: 200 } });
      const result = await f.client.callTool({ name: "execute", arguments: { quoteId: "q", idempotencyKey: "same-key" } });
      const error = body(result).error as { code: string; access: { profileId: string } };
      assert.equal(error.code, code); assert.equal(error.access.profileId, "bob");
    }
    assert.deepEqual(f.store.list("operation:"), []); assert.equal(f.prompts, 0);
  } finally { await f.close(); }
});

test("revoking one permission and zeroing a cap preserve unrelated access", async () => {
  const f = await fixture();
  try {
    await f.request();
    const result = await f.request({ permissions: { inventory: false }, swapLimits: [{ token: "TOKEN", amount: "0" }] });
    assert.equal(body(result).status, "approved");
    const saved = f.profile().policy;
    assert.equal(saved.inventory, false); assert.equal(saved.swapLimits.TOKEN, "0");
    assert.equal(saved.swaps, true); assert.equal(saved.claims, true); assert.equal(saved.bridges, true);
    assert.deepEqual(saved.bridgeLimits, { USDC: "2000000" }); assert.equal(saved.maxSlippageBps, 50);
  } finally { await f.close(); }
});
