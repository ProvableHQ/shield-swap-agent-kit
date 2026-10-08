import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBridgeClient, createBridgeCheckpoint, type BridgeClient, type BridgeReceipt } from "@provablehq/aleo-bridge-sdk";
import { TradingStore } from "../src/trading/store";
import { BridgeBackend } from "../src/trading/bridge";
import type { Profile, SavedQuote, Operation } from "../src/trading/types";
const profile: Profile = { id: "alice", network: "mainnet", address: "aleo1test", key: { type: "env", name: "TEST_KEY" },
  evm: { provider: "local", address: "0x1111111111111111111111111111111111111111", rpcUrl: "https://rpc.invalid", key: { type: "env", name: "EVM_TEST_KEY" } },
  policy: { swaps: false, claims: false, bridges: true, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: { "aleo/usdcx": "3000000" } } };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shield-bridge-"));
  const store = new TradingStore(root, "test-password-long-enough", true);
  return { store, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("bridge quote retains the SDK plan and returns chain-qualified atomic input", async () => {
  const f = fixture();
  try {
    const sdk = createBridgeClient({ environment: "mainnet" });
    const backend = new BridgeBackend(f.store, async () => sdk);
    const result = await backend.quote(profile, { sourceChain: "aleo", sourceAsset: "usdcx", destinationChain: "ethereum", destinationAsset: "usdc", amount: "2.000001" });
    assert.equal(result.summary.tokenIn, "aleo/usdcx");
    assert.equal(result.summary.amountIn, "2000001");
    assert.equal(result.summary.recipient, profile.evm!.address);
    assert.equal(result.plan.quote.plan.sender, profile.address);
    assert.equal(result.plan.quote.plan.recipient, profile.evm!.address);
    assert.equal(result.plan.quote.kind, "aleo-xreserve");
  } finally { f.close(); }
});
test("bridge recovery uses saved checkpoints and never repeats source execution", async () => {
  const f = fixture();
  try {
    const sdk = createBridgeClient({ environment: "mainnet" });
    let submissions = 0, resumed = 0;
    const quote = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" }, destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001", sender: profile.address, recipient: profile.evm!.address });
    const receipt: BridgeReceipt = { id: "at1bridge", protocol: "xreserve", status: "SOURCE_CONFIRMING", sourceTxId: "at1bridge", protocolState: { routeId: quote.plan.route.id, privateDebug: "DO-NOT-EXPOSE" } };
    let saved: unknown;
    const client = { ...sdk, execute: async (args: Parameters<BridgeClient["execute"]>[0]) => {
      submissions++;
      assert.deepEqual(args.plan, quote.plan);
      await args.onCheckpoint!(createBridgeCheckpoint(quote.plan, receipt));
      throw new Error("timeout DO-NOT-EXPOSE");
    }, recover: async ({ checkpoint }: Parameters<BridgeClient["recover"]>[0]) => {
      assert.equal(checkpoint.source?.transactionId, "at1bridge");
      return { next: "done" as const, plan: quote.plan, receipt: { ...receipt, status: "COMPLETED" as const } };
    }, resume: async () => { resumed++; throw new Error("unexpected resume"); } } as BridgeClient;
    const backend = new BridgeBackend(f.store, async () => client);
    const offer: SavedQuote = { id: "q", kind: "bridge", profile, scope: "", createdAt: 0, expiresAt: Date.now() + 60000, summary: {}, plan: { quote, sourceBalance: "public" } };
    await assert.rejects(backend.execute(offer, { operationId: "o", checkpoint: value => { saved = value; } }));
    const op: Operation = { id: "o", kind: "bridge", profileId: profile.id, scope: "", quoteId: "q", requestKey: "r", status: "uncertain", createdAt: 0, updatedAt: 0, checkpoint: saved, result: {} };
    const result = await backend.resume(offer, op, { operationId: "o", checkpoint: value => { saved = value; } });
    assert.equal(result.status, "complete");
    assert.equal(submissions, 1);
    assert.equal(resumed, 0);
    assert.ok(!JSON.stringify(result.result).includes("DO-NOT-EXPOSE"));
  } finally { f.close(); }
});
test("a testnet profile cannot quote a mainnet bridge route", async () => {
  const f = fixture();
  try {
    const sdk = createBridgeClient({ environment: "mainnet" });
    const backend = new BridgeBackend(f.store, async () => sdk);
    await assert.rejects(backend.quote({ ...profile, network: "testnet" }, { sourceChain: "aleo", sourceAsset: "usdcx", destinationChain: "ethereum", destinationAsset: "usdc", amount: "2.000001" }), /network|environment/i);
  } finally { f.close(); }
});

test("signed EVM transaction identity is saved before a broadcast response can be lost", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { keccak256 } = await import("viem");
  const { checkpointFetch } = await import("../src/trading/bridge-broadcast");
  const { bridgeContext } = await import("../src/trading/bridge-state");
  const sdk = createBridgeClient({ environment: "mainnet" });
  const quote = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" }, destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001", recipient: profile.evm!.address });
  const account = privateKeyToAccount(("0x" + "01".repeat(32)) as "0x01");
  const wire = await account.signTransaction({ chainId: 1, nonce: 0, to: profile.evm!.address as "0x01", value: 1n, gas: 21000n, gasPrice: 1n });
  const state: import("../src/trading/bridge-state").BridgeState = { version: 1, plan: quote.plan, started: true };
  let saved: typeof state | undefined, broadcasts = 0;
  const transport = checkpointFetch("ethereum", async () => {
    broadcasts++;
    assert.equal(saved?.checkpoint?.destination?.transactionId, keccak256(wire));
    throw new Error("lost RPC response");
  });
  await assert.rejects(bridgeContext.run({ state, persist: () => { saved = structuredClone(state); },
    submission: { chain: "ethereum", role: "destination", captured: false } },
    () => transport("https://rpc.invalid", { method: "POST", body: JSON.stringify({ method: "eth_sendRawTransaction", params: [wire] }) })), /lost RPC/);
  assert.equal(broadcasts, 1);
  assert.equal(saved?.checkpoint?.destination?.transactionId, keccak256(wire));
});
test("failed bridge checkpoint persistence prevents RPC submission", async () => {
  const { checkpointFetch } = await import("../src/trading/bridge-broadcast");
  const { bridgeContext } = await import("../src/trading/bridge-state");
  const sdk = createBridgeClient({ environment: "mainnet" });
  const quote = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" }, destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001", recipient: profile.evm!.address });
  let broadcasts = 0;
  const transport = checkpointFetch("ethereum", async () => { broadcasts++; return new Response("{}"); });
  await assert.rejects(bridgeContext.run({ state: { version: 1, plan: quote.plan, started: true }, persist: () => { throw new Error("disk full"); },
    submission: { chain: "ethereum", role: "destination", captured: false } },
    () => transport("https://rpc.invalid", { method: "POST", body: JSON.stringify({ method: "eth_sendRawTransaction", params: ["0x01"] }) })), /disk full/);
  assert.equal(broadcasts, 0);
});

test("Solana broadcast identity is durable before the RPC request", async () => {
  const kit = await import("@solana/kit");
  const { checkpointFetch } = await import("../src/trading/bridge-broadcast");
  const { bridgeContext } = await import("../src/trading/bridge-state");
  const signer = await kit.generateKeyPairSigner();
  const message = kit.pipe(
    kit.createTransactionMessage({ version: 0 }),
    value => kit.setTransactionMessageFeePayerSigner(signer, value),
    value => kit.setTransactionMessageLifetimeUsingBlockhash({ blockhash: kit.blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 123n }, value),
  );
  const signed = await kit.signTransactionMessageWithSigners(message);
  const wire = Buffer.from(kit.getTransactionEncoder().encode(signed)).toString("base64");
  const signature = kit.getSignatureFromTransaction(signed);
  const sdk = createBridgeClient({ environment: "mainnet" });
  const quoted = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" }, destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001", recipient: profile.evm!.address });
  const state: import("../src/trading/bridge-state").BridgeState = { version: 1, plan: quoted.plan, started: true };
  let saved = false;
  const transport = checkpointFetch("solana", async () => {
    assert.equal(saved, true);
    assert.equal(state.checkpoint?.source?.transactionId, signature);
    return new Response(JSON.stringify({ result: signature }));
  });
  await bridgeContext.run({ state, persist: () => { saved = true; }, submission: { chain: "solana", role: "source", captured: false } },
    () => transport("https://rpc.invalid", { method: "POST", body: JSON.stringify({ method: "sendTransaction", params: [wire, { encoding: "base64" }] }) }));
});

test("merging a prepared Aleo checkpoint preserves the SDK recovery format", async () => {
  const { mergeCheckpoint } = await import("../src/trading/bridge");
  const sdk = createBridgeClient({ environment: "mainnet" });
  const quoted = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" }, destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001", recipient: profile.evm!.address });
  const checkpoint = createBridgeCheckpoint(quoted.plan, { id: "at1prepared", protocol: "xreserve", status: "SOURCE_SUBMISSION_PENDING",
    protocolState: { routeId: quoted.plan.route.id, preparedTransaction: JSON.stringify({ id: "at1prepared" }) } });
  const recovered = await sdk.recover({ checkpoint: mergeCheckpoint(undefined, checkpoint) });
  assert.equal(recovered.next, "resume");
});

async function privateMintFixture() {
  const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
  const recipient = (await loadNetwork("mainnet")).generateAccount().address;
  const sdk = createBridgeClient({ environment: "mainnet", clients: {
    ethereum: { family: "evm", publicClient: {
      getChainId: async () => 1, getTransactionReceipt: async () => null,
      call: async () => "0x" + (1000000000000n).toString(16).padStart(64, "0"),
    }, walletClient: { getAddress: async () => profile.evm!.address } },
    aleo: { family: "aleo", publicClient: { request: async () => ({ status: "accepted" }) } },
  } as unknown as NonNullable<Parameters<typeof createBridgeClient>[0]>["clients"] });
  const quote = await sdk.quote({ source: { chain: "ethereum", asset: "usdc" },
    destination: { chain: "aleo", asset: "usdcx" }, amount: "2.000001",
    sender: profile.evm!.address, recipient, mintMode: "private", privateMintSecretNonce: "1scalar" });
  assert.equal(quote.kind, "evm-xreserve");
  return { sdk, quote };
}

test("private mint recovery accepts a submitted destination after its prepared checkpoint", async () => {
  const { mergeCheckpoint } = await import("../src/trading/bridge");
  const { sdk, quote } = await privateMintFixture();
  const checkpoint = createBridgeCheckpoint(quote.plan, { id: "0x" + "11".repeat(32),
    protocol: "xreserve", status: "SOURCE_CONFIRMING", sourceTxId: "0x" + "11".repeat(32),
    protocolState: { routeId: quote.plan.route.id, hookData: quote.kind === "evm-xreserve" ? quote.hookData : undefined } });
  const prepared = { ...checkpoint, destination: { preparedTransaction: {
    transactionId: "at1mint", serializedTransaction: JSON.stringify({ id: "at1mint" }),
  } } };
  const submitted = { ...checkpoint, destination: { transactionId: "at1mint" } };
  const recovered = await sdk.recover({ checkpoint: mergeCheckpoint(prepared, submitted) });
  assert.equal(recovered.next, "done");
  assert.equal(recovered.receipt.destinationTxId, "at1mint");
});

for (const role of ["approval", "source"] as const) {
  test("lost first " + role + " response preserves the private mint nonce in native recovery", async () => {
    const { checkpointFetch } = await import("../src/trading/bridge-broadcast");
    const { bridgeContext } = await import("../src/trading/bridge-state");
    const { sdk, quote } = await privateMintFixture();
    const f = fixture();
    try {
      let saved: import("../src/trading/bridge-state").BridgeState | undefined;
      const transport = checkpointFetch("ethereum", async () => { throw new Error("lost response"); });
      const client = { ...sdk, execute: async () => {
        const active = bridgeContext.getStore()!;
        active.submission = { chain: "ethereum", role, captured: false };
        await transport("https://rpc.invalid", { method: "POST", body: JSON.stringify({
          method: "eth_sendRawTransaction", params: ["0x01"],
        }) });
        throw new Error("unexpected response");
      } } as BridgeClient;
      const backend = new BridgeBackend(f.store, async () => client);
      const offer: SavedQuote = { id: "q", kind: "bridge", profile, scope: "", createdAt: 0,
        expiresAt: Date.now() + 60000, summary: {}, plan: { quote, sourceBalance: "public", privateMintSecretNonce: "1scalar" } };
      await assert.rejects(backend.execute(offer, { operationId: "o",
        checkpoint: state => { saved = structuredClone(state) as typeof saved; } }), /lost response/);
      const recovered = await sdk.recover({ checkpoint: saved!.checkpoint! });
      assert.equal(quote.kind, "evm-xreserve");
      if (quote.kind !== "evm-xreserve") throw new Error("wrong fixture");
      assert.equal(recovered.receipt.protocolState.hookData, quote.hookData);
      assert.equal(recovered.receipt.status, role === "approval" ? "SOURCE_APPROVAL_PENDING" : "SOURCE_CONFIRMING");
    } finally { f.close(); }
  });
}

test("native pre-submission failure is durable while an interrupted bridge stays uncertain", async () => {
  const f = fixture();
  try {
    // The real SDK rejects this public burn before signing: no wallet is configured.
    const sdk = createBridgeClient({ environment: "mainnet" });
    const backend = new BridgeBackend(f.store, async () => sdk);
    const quoted = await backend.quote(profile, { sourceChain: "aleo", sourceAsset: "usdcx",
      destinationChain: "ethereum", destinationAsset: "usdc", amount: "2.000001" });
    const offer: SavedQuote = { id: "q", kind: "bridge", profile, scope: "", createdAt: 0,
      expiresAt: Date.now() + 60000, summary: quoted.summary, plan: quoted.plan };
    const op: Operation = { id: "o", kind: "bridge", profileId: profile.id, scope: "", quoteId: "q",
      requestKey: "r", status: "uncertain", createdAt: 0, updatedAt: 0, result: {} };
    const result = await backend.execute(offer, { operationId: "o", checkpoint: value => {
      f.store.set("checkpoint", value);
    } });
    assert.equal(result.status, "failed");
    assert.equal((result.result.error as { code: string }).code, "not_submitted");
    assert.equal((await backend.reconcile(offer, { ...op, checkpoint: f.store.get("checkpoint") })).status, "failed");
    assert.equal((await backend.reconcile(offer, { ...op, checkpoint: {
      version: 1, plan: quoted.plan.quote.plan, started: true,
    } })).status, "uncertain");
    assert.equal((await backend.reconcile(offer, { ...op, checkpoint: {
      version: 1, plan: quoted.plan.quote.plan, started: true, unknownSubmission: true,
    } })).status, "uncertain");
    assert.deepEqual(quoted.summary.fees, [{ kind: "protocol", chainId: "aleo", assetId: "aleo/usdcx", amount: "2", estimated: false }]);
  } finally { f.close(); }
});

test("bridge status advances recovered Hyperlane receipts through the SDK destination check", async () => {
  const f = fixture();
  try {
    const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
    const recipient = (await loadNetwork("mainnet")).generateAccount().address;
    let delivered = false, destinationReads = 0;
    const { encodeAbiParameters, parseAbiParameters, zeroAddress } = await import("viem");
    const sdk = createBridgeClient({ environment: "mainnet", clients: { aleo: {
      family: "aleo", publicClient: { request: async () => { destinationReads++; return delivered ? "true" : null; } },
    }, ethereum: { family: "evm", publicClient: { getChainId: async () => 1,
      call: async () => encodeAbiParameters(parseAbiParameters("(address token, uint256 amount)[]"), [[{ token: zeroAddress, amount: 2n }]]),
    } } } as unknown as NonNullable<Parameters<typeof createBridgeClient>[0]>["clients"] });
    const { plan } = await sdk.quote({ source: { chain: "ethereum", asset: "eth" }, destination: { chain: "aleo", asset: "eth" },
      amount: "0.000000000000000001", sender: profile.evm!.address, recipient });
    const receipt: BridgeReceipt = { id: "0x" + "11".repeat(32), protocol: "hyperlane", status: "DELIVERY_PENDING",
      sourceTxId: "0x" + "22".repeat(32), messageId: "0x" + "11".repeat(32), protocolState: { routeId: plan.route.id } };
    const client = { ...sdk, recover: async () => ({ next: "wait" as const, plan, receipt }) } as BridgeClient;
    const backend = new BridgeBackend(f.store, async () => client);
    const offer: SavedQuote = { id: "q", kind: "bridge", profile, scope: "", createdAt: 0,
      expiresAt: 0, summary: {}, plan: {} };
    const op: Operation = { id: "o", kind: "bridge", profileId: profile.id, scope: "", quoteId: "q", requestKey: "r",
      status: "pending", createdAt: 0, updatedAt: 0, result: {}, checkpoint: {
        version: 1, plan, started: true, checkpoint: createBridgeCheckpoint(plan, receipt),
      } };
    assert.equal((await backend.reconcile(offer, op)).status, "pending");
    delivered = true;
    const result = await backend.reconcile(offer, op);
    assert.equal(result.status, "complete");
    assert.equal(result.result.bridgeStatus, "COMPLETED");
    assert.equal(destinationReads, 2);
  } finally { f.close(); }
});

test("outbound xReserve status identifies missing SDK destination verification without resubmitting", async () => {
  const f = fixture();
  try {
    const sdk = createBridgeClient({ environment: "mainnet" });
    const { plan } = await sdk.quote({ source: { chain: "aleo", asset: "usdcx" },
      destination: { chain: "ethereum", asset: "usdc" }, amount: "2.000001",
      sender: profile.address, recipient: profile.evm!.address });
    const receipt: BridgeReceipt = { id: "at1burn", protocol: "xreserve", status: "DELIVERY_PENDING",
      sourceTxId: "at1burn", protocolState: { routeId: plan.route.id } };
    const client = { ...sdk, recover: async () => ({ next: "wait" as const, plan, receipt }),
      resume: async () => { throw new Error("Must not resubmit an accepted burn"); },
    } as BridgeClient;
    const backend = new BridgeBackend(f.store, async () => client);
    const offer: SavedQuote = { id: "q", kind: "bridge", profile, scope: "", createdAt: 0,
      expiresAt: 0, summary: {}, plan: {} };
    const operation: Operation = { id: "o", kind: "bridge", profileId: profile.id, scope: "", quoteId: "q",
      requestKey: "r", status: "pending", createdAt: 0, updatedAt: 0, result: {}, checkpoint: {
        version: 1, plan, started: true, checkpoint: createBridgeCheckpoint(plan, receipt),
      } };
    for (const result of [await backend.reconcile(offer, operation),
      await backend.resume(offer, operation, { operationId: "o", checkpoint: () => {} })]) {
      assert.equal(result.status, "pending");
      assert.equal(result.result.bridgeStatus, "DELIVERY_PENDING");
      assert.equal(result.result.nextAction, "verify_destination_externally");
      assert.equal(result.result.deliveryVerification, "unsupported_by_sdk");
      assert.match(String(result.result.message), /Do not repeat/);
    }
  } finally { f.close(); }
});
