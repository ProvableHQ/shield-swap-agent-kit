import {
  createAleoClient, createBridgeClient, createEvmClient, createSolanaClient,
  evmHttp, evmPrivateKey, solanaHttp, solanaKeyPair, type BridgeChainClient,
  type EvmClient, type SolanaClient,
} from "@provablehq/aleo-bridge-sdk";
import type { Hex } from "viem";
import { checkpointFetch, trackBridgeWallet } from "./bridge-broadcast";
import { createHostedBridgeWallet } from "./hosted-wallets";
import { createSessionFactory, resolveSecret } from "./session";
import { TradingStore } from "./store";
import { TradingError, type Profile } from "./types";
import type { BridgeSessionFactory } from "./bridge";
export function createBridgeSessionFactory(store: TradingStore, env: NodeJS.ProcessEnv = process.env): BridgeSessionFactory {
  const aleoSession = createSessionFactory(store, env, false);
  return async (profile: Profile) => {
    const native = await aleoSession(profile);
    const clients: Record<string, BridgeChainClient> = {
      [profile.network === "mainnet" ? "aleo" : "aleo-testnet"]: createAleoClient({ publicClient: native.publicClient, account: native.client }),
    };
    if (profile.evm) {
      const wallet = profile.evm;
      const chain = profile.network === "mainnet" ? "ethereum" : "sepolia";
      let ethereum: EvmClient;
      if (wallet.provider === "local") {
        const key = resolveSecret(wallet.key, store, env);
        ethereum = createEvmClient({ transport: evmHttp(wallet.rpcUrl, { fetch: checkpointFetch(chain) }), account: evmPrivateKey((key.startsWith("0x") ? key : "0x" + key) as Hex) });
      } else ethereum = await createHostedBridgeWallet("evm", wallet, profile.network, store, { env }) as EvmClient;
      if ((await ethereum.walletClient!.getAddress()).toLowerCase() !== wallet.address.toLowerCase()) throw new TradingError("wallet_mismatch", "Configured EVM signer does not match its wallet address.");
      trackBridgeWallet(chain, ethereum);
      clients[chain] = ethereum;
    }
    if (profile.solana) {
      if (profile.network !== "mainnet") throw new TradingError("unsupported_network", "The SDK has no Solana testnet bridge route.");
      const wallet = profile.solana;
      let solana: SolanaClient;
      if (wallet.provider === "local") {
        let bytes: Uint8Array;
        try {
          const parsed: unknown = JSON.parse(resolveSecret(wallet.key, store, env));
          if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some(item => !Number.isInteger(item) || item < 0 || item > 255)) throw new Error();
          bytes = Uint8Array.from(parsed);
        } catch { throw new TradingError("invalid_key", "The Solana key must be a JSON array containing 64 bytes."); }
        solana = createSolanaClient({ transport: solanaHttp(wallet.rpcUrl, { fetch: checkpointFetch("solana") }), account: solanaKeyPair(bytes) });
      } else solana = await createHostedBridgeWallet("solana", wallet, profile.network, store, { env }) as SolanaClient;
      if (await solana.walletClient!.getAddress() !== wallet.address) throw new TradingError("wallet_mismatch", "Configured Solana signer does not match its wallet address.");
      trackBridgeWallet("solana", solana);
      clients.solana = solana;
    }
    return createBridgeClient({ environment: profile.network, clients });
  };
}
