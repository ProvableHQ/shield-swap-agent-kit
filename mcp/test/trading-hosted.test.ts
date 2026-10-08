import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { PrivyClient } from "@privy-io/node";
import { TradingStore } from "../src/trading/store";
import { createHostedBridgeWallet, type ProviderFactories } from "../src/trading/hosted-wallets";
import type { HostedWallet } from "../src/trading/types";

const account = privateKeyToAccount(("0x" + "01".repeat(32)) as "0x01");
const solanaAddress = "11111111111111111111111111111111";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "shield-hosted-"));
  const store = new TradingStore(root, "test-passphrase-long-enough", true);
  return { store, close: () => { store.close(); rmSync(root, { recursive: true, force: true }); } };
}
const ref = (name: string) => ({ type: "env" as const, name });
for (const chain of ["evm", "solana"] as const) {
  test("Privy " + chain + " binds the existing provider identity through the native adapter", async () => {
    const f = fixture();
    const address = chain === "evm" ? account.address : solanaAddress;
    let observedAddress = address;
    const factories: ProviderFactories = {
      privy: async credentials => new PrivyClient({ ...credentials, maxRetries: 0,
        fetch: async (_url, init) => {
          assert.equal(init?.method, "GET");
          return new Response(JSON.stringify({ id: "existing-wallet", address: observedAddress,
            chain_type: chain === "evm" ? "ethereum" : "solana" }), { headers: { "content-type": "application/json" } });
        } }),
      dynamicEvm: async () => { throw new Error("unexpected Dynamic"); },
      dynamicSolana: async () => { throw new Error("unexpected Dynamic"); },
    };
    const wallet: HostedWallet = { provider: "privy", address, rpcUrl: "https://rpc.invalid",
      walletId: "existing-wallet", appId: ref("APP"), appSecret: ref("SECRET") };
    try {
      const connected = await createHostedBridgeWallet(chain, wallet, "mainnet", f.store,
        { env: { APP: "test-app", SECRET: "private-test-secret" }, factories });
      assert.equal(await connected.walletClient!.getAddress(), address);
      observedAddress = chain === "evm" ? "0x" + "22".repeat(20) : "So11111111111111111111111111111111111111112";
      await assert.rejects(createHostedBridgeWallet(chain, wallet, "mainnet", f.store,
        { env: { APP: "test-app", SECRET: "private-test-secret" }, factories }), /match/);
    } finally { f.close(); }
  });

  test("Dynamic " + chain + " restores matching creation metadata without creating a wallet", async () => {
    const f = fixture();
    const address = chain === "evm" ? account.address : "So11111111111111111111111111111111111111112";
    const metadata = { walletId: "existing-wallet", accountAddress: address, chainName: chain === "evm" ? "EVM" : "SVM",
      thresholdSignatureScheme: "TWO_OF_TWO", externalServerKeySharesBackupInfo: { marker: "creation-backup" } };
    let foundId = metadata.walletId;
    const provider = {
      authenticateApiToken: async (token: string) => { assert.equal(token, "private-api-token"); },
      getWalletByAddress: async () => ({ ...metadata, walletId: foundId,
        ...(chain === "solana" ? { chainName: "SOL", accountAddress: address.toLowerCase() } : {}),
        externalServerKeySharesBackupInfo: undefined }),
      getWalletClient: async (options: { walletMetadata: unknown; password: string }) => {
        assert.deepEqual(options.walletMetadata, metadata);
        assert.equal(options.password, "private-wallet-password");
        return { account };
      },
      signTransaction: async () => { throw new Error("construction must not sign"); },
    };
    const factories = { privy: async () => { throw new Error("unexpected Privy"); },
      dynamicEvm: async () => provider, dynamicSolana: async () => provider } as unknown as ProviderFactories;
    const wallet: HostedWallet = { provider: "dynamic", address, rpcUrl: "https://rpc.invalid", environmentId: "test-environment",
      apiToken: ref("TOKEN"), metadata: ref("METADATA"), password: ref("PASSWORD") };
    const env = { TOKEN: "private-api-token", METADATA: JSON.stringify(metadata), PASSWORD: "private-wallet-password" };
    try {
      const connected = await createHostedBridgeWallet(chain, wallet, "mainnet", f.store, { env, factories });
      assert.equal(await connected.walletClient!.getAddress(), address);
      foundId = "different-wallet";
      await assert.rejects(createHostedBridgeWallet(chain, wallet, "mainnet", f.store, { env, factories }), /match/);
    } finally { f.close(); }
  });
}

for (const providerName of ["privy", "dynamic"] as const) {
  test(providerName + " Solana signs through the SDK and saves its identity before RPC broadcast", async () => {
    const kit = await import("@solana/kit");
    const { DEFAULT_BRIDGE_REGISTRY } = await import("@provablehq/aleo-bridge-sdk");
    const { bridgeContext } = await import("../src/trading/bridge-state");
    const { trackBridgeWallet } = await import("../src/trading/bridge-broadcast");
    const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
    const signer = await kit.generateKeyPairSigner(), ephemeral = await kit.generateKeyPairSigner();
    const message = kit.pipe(kit.createTransactionMessage({ version: 0 }),
      tx => kit.setTransactionMessageFeePayer(signer.address, tx),
      tx => kit.setTransactionMessageLifetimeUsingBlockhash({ blockhash: kit.blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 123n }, tx),
      tx => kit.appendTransactionMessageInstruction({ programAddress: kit.address("11111111111111111111111111111111"),
        accounts: [{ address: ephemeral.address, role: kit.AccountRole.READONLY_SIGNER }], data: new Uint8Array([1]) }, tx));
    const partial = await kit.partiallySignTransaction([ephemeral.keyPair], kit.compileTransaction(message));
    const wire = new Uint8Array(kit.getTransactionEncoder().encode(partial));
    const metadata = { walletId: "existing-wallet", accountAddress: signer.address, chainName: "SVM", thresholdSignatureScheme: "TWO_OF_TWO", externalServerKeySharesBackupInfo: { marker: "saved" } };
    const factories = {
      privy: async (credentials: { appId: string; appSecret: string }) => new PrivyClient({ ...credentials, maxRetries: 0, fetch: async (_url, init) => {
        if (init?.method === "GET") return Response.json({ id: "existing-wallet", chain_type: "solana", address: signer.address });
        const body = JSON.parse(String(init?.body));
        assert.equal(body.method, "signTransaction");
        const tx = kit.getTransactionDecoder().decode(Buffer.from(body.params.transaction, "base64"));
        const signed = await kit.partiallySignTransaction([signer.keyPair], tx);
        return Response.json({ method: "signTransaction", data: { encoding: "base64", signed_transaction: Buffer.from(kit.getTransactionEncoder().encode(signed)).toString("base64") } });
      } }),
      dynamicEvm: async () => { throw new Error("unexpected EVM"); },
      dynamicSolana: async () => ({
        authenticateApiToken: async () => {},
        getWalletByAddress: async () => metadata,
        signTransaction: async (params: { transaction: string; sponsor: boolean; context: { svmTransaction: { chainId: string } } }) => {
          assert.equal(params.sponsor, false);
          assert.equal(params.context.svmTransaction.chainId, "101");
          const signature = await kit.signBytes(signer.keyPair.privateKey, Buffer.from(params.transaction.slice(2), "hex"));
          return kit.getBase58Decoder().decode(signature);
        },
      }),
    } as unknown as ProviderFactories;
    const registry = DEFAULT_BRIDGE_REGISTRY;
    const route = registry.routes.find(route => route.sourceAssetId === "solana/sol" && route.destinationAssetId === "aleo/sol")!;
    assert.ok(route);
    const plan: import("@provablehq/aleo-bridge-sdk").BridgePlan = { registryVersion: registry.version, protocol: route.protocol, route,
      sourceAsset: registry.assets.find(asset => asset.id === route.sourceAssetId)!,
      destinationAsset: registry.assets.find(asset => asset.id === route.destinationAssetId)!,
      amountIn: "0.001", sender: signer.address, recipient: (await loadNetwork("mainnet")).generateAccount().address,
      mintMode: "public", privateRecipient: false, fees: [], steps: [] };
    const state: import("../src/trading/bridge-state").BridgeState = { version: 1, plan, started: true };
    const wallet: HostedWallet = { provider: providerName, address: signer.address, rpcUrl: "https://rpc.invalid",
      walletId: "existing-wallet", appId: ref("APP"), appSecret: ref("SECRET"), environmentId: "test-environment",
      apiToken: ref("TOKEN"), metadata: ref("METADATA"), password: ref("PASSWORD") };
    const f = fixture();
    let saved: typeof state | undefined, broadcasts = 0;
    try {
      const client = await createHostedBridgeWallet("solana", wallet, "mainnet", f.store, { factories,
        env: { APP: "app", SECRET: "secret", TOKEN: "token", METADATA: JSON.stringify(metadata), PASSWORD: "password" },
        fetch: async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          assert.equal(request.method, "sendTransaction");
          const signed = kit.getTransactionDecoder().decode(Buffer.from(request.params[0], "base64"));
          assert.ok(kit.isFullySignedTransaction(signed));
          assert.deepEqual(Buffer.from(signed.signatures[ephemeral.address]!), Buffer.from(partial.signatures[ephemeral.address]!));
          const signature = kit.getSignatureFromTransaction(signed);
          assert.equal(saved?.checkpoint?.source?.transactionId, signature);
          broadcasts++;
          return Response.json({ jsonrpc: "2.0", id: 1, result: signature });
        } });
      if (client.family !== "solana") throw new Error("wrong chain");
      trackBridgeWallet("solana", client);
      const result = await bridgeContext.run({ state, persist: () => { saved = structuredClone(state); } },
        () => client.walletClient!.sendTransaction(wire));
      assert.equal(result.signature, saved?.checkpoint?.source?.transactionId);
      assert.equal(broadcasts, 1);
    } finally { f.close(); }
  });
}

for (const providerName of ["privy", "dynamic"] as const) {
  test(providerName + " EVM signs through viem and saves the hash before RPC broadcast", async () => {
    const { keccak256, parseTransaction } = await import("viem");
    const { createBridgeClient } = await import("@provablehq/aleo-bridge-sdk");
    const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
    const { bridgeContext } = await import("../src/trading/bridge-state");
    const { trackBridgeWallet } = await import("../src/trading/bridge-broadcast");
    const metadata = { walletId: "existing-wallet", accountAddress: account.address, chainName: "EVM",
      thresholdSignatureScheme: "TWO_OF_TWO", externalServerKeySharesBackupInfo: { marker: "saved" } };
    const factories = {
      privy: async (credentials: { appId: string; appSecret: string }) => new PrivyClient({ ...credentials, maxRetries: 0, fetch: async (_url, init) => {
        if (init?.method === "GET") return Response.json({ id: "existing-wallet", chain_type: "ethereum", address: account.address });
        const body = JSON.parse(String(init?.body));
        assert.equal(body.method, "eth_signTransaction");
        const tx = body.params.transaction;
        const signed = await account.signTransaction({ type: "legacy", chainId: tx.chain_id,
          nonce: tx.nonce ?? 0, to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0),
          gas: BigInt(tx.gas_limit), gasPrice: BigInt(tx.gas_price) });
        return Response.json({ method: "eth_signTransaction", data: { signed_transaction: signed } });
      } }),
      dynamicEvm: async () => ({ authenticateApiToken: async () => {}, getWalletByAddress: async () => metadata,
        getWalletClient: async () => ({ account }) }),
      dynamicSolana: async () => { throw new Error("unexpected Solana"); },
    } as unknown as ProviderFactories;
    const recipient = (await loadNetwork("mainnet")).generateAccount().address;
    const sdk = createBridgeClient({ environment: "mainnet", clients: { ethereum: { family: "evm",
      publicClient: { getChainId: async () => 1, call: async () => "0x" + (1000000000000n).toString(16).padStart(64, "0") },
      walletClient: { getAddress: async () => account.address } } } as never });
    const quoted = await sdk.quote({ source: { chain: "ethereum", asset: "usdc" }, destination: { chain: "aleo", asset: "usdcx" },
      sender: account.address, recipient, amount: "2" });
    const state: import("../src/trading/bridge-state").BridgeState = { version: 1, plan: quoted.plan, started: true };
    const wallet: HostedWallet = { provider: providerName, address: account.address, rpcUrl: "https://rpc.invalid",
      walletId: "existing-wallet", appId: ref("APP"), appSecret: ref("SECRET"), environmentId: "test-environment",
      apiToken: ref("TOKEN"), metadata: ref("METADATA"), password: ref("PASSWORD") };
    const f = fixture();
    let saved: typeof state | undefined, broadcasts = 0;
    try {
      const client = await createHostedBridgeWallet("evm", wallet, "mainnet", f.store, { factories,
        env: { APP: "app", SECRET: "secret", TOKEN: "token", METADATA: JSON.stringify(metadata), PASSWORD: "password" },
        fetch: async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          let result: unknown;
          switch (request.method) {
            case "eth_chainId": result = "0x1"; break;
            case "eth_getTransactionCount": result = "0x0"; break;
            case "eth_estimateGas": result = "0x5208"; break;
            case "eth_gasPrice": result = "0x1"; break;
            case "eth_getBlockByNumber": result = { number: "0x1", gasLimit: "0x1c9c380", gasUsed: "0x0", timestamp: "0x1", transactions: [] }; break;
            case "eth_sendRawTransaction": {
              const signed = request.params[0];
              const tx = parseTransaction(signed);
              assert.equal(tx.chainId, 1);
              assert.equal(tx.value, 1n);
              result = keccak256(signed);
              assert.equal(saved?.checkpoint?.source?.transactionId, result);
              broadcasts++;
              break;
            }
            default: throw new Error("Unexpected RPC method " + request.method);
          }
          return Response.json({ jsonrpc: "2.0", id: request.id, result });
        } });
      if (client.family !== "evm") throw new Error("wrong chain");
      trackBridgeWallet("ethereum", client);
      const hash = await bridgeContext.run({ state, persist: () => { saved = structuredClone(state); } },
        () => client.walletClient!.sendTransaction({ chainId: 1, from: account.address, to: account.address, data: "0x", value: 1n }));
      assert.equal(hash, saved?.checkpoint?.source?.transactionId);
      assert.equal(broadcasts, 1);
    } finally { f.close(); }
  });
}
