import type { PrivyClient } from "@privy-io/node";
import type { DynamicEvmWalletClient } from "@dynamic-labs-wallet/node-evm";
import type { DynamicSvmWalletClient } from "@dynamic-labs-wallet/node-svm";
import type { DynamicEvmClientConfig } from "@provablehq/aleo-bridge-sdk/dynamic";
import { evmHttp, solanaHttp, type EvmClient, type SolanaClient } from "@provablehq/aleo-bridge-sdk";
import { getAddress } from "viem";
import { checkpointFetch } from "./bridge-broadcast";
import { resolveSecret } from "./session";
import { TradingStore } from "./store";
import { TradingError, type HostedWallet, type Network, type SecretRef } from "./types";

type DynamicEvm = Pick<DynamicEvmWalletClient, "authenticateApiToken" | "getWalletByAddress" | "getWalletClient">;
type DynamicSolana = Pick<DynamicSvmWalletClient, "authenticateApiToken" | "getWalletByAddress" | "signTransaction">;
export type ProviderFactories = {
  privy(credentials: { appId: string; appSecret: string }): Promise<PrivyClient>;
  dynamicEvm(environmentId: string): Promise<DynamicEvm>;
  dynamicSolana(environmentId: string): Promise<DynamicSolana>;
};
const providers: ProviderFactories = {
  privy: async credentials => {
    const { PrivyClient } = await import("@privy-io/node");
    return new PrivyClient({ ...credentials, maxRetries: 0 });
  },
  dynamicEvm: async environmentId => {
    const { DynamicEvmWalletClient } = await import("@dynamic-labs-wallet/node-evm");
    return new DynamicEvmWalletClient({ environmentId });
  },
  dynamicSolana: async environmentId => {
    const { DynamicSvmWalletClient } = await import("@dynamic-labs-wallet/node-svm");
    return new DynamicSvmWalletClient({ environmentId });
  },
};
type Options = { env?: NodeJS.ProcessEnv; factories?: ProviderFactories; fetch?: typeof fetch };
function sameAddress(chain: "evm" | "solana", a: string, b: string): boolean {
  try { return chain === "evm" ? getAddress(a) === getAddress(b) : a === b; } catch { return false; }
}
export async function createHostedBridgeWallet(chain: "evm" | "solana", wallet: HostedWallet, network: Network, store: TradingStore, options: Options = {}): Promise<EvmClient | SolanaClient> {
  if (chain === "solana" && network !== "mainnet") throw new TradingError("unsupported_network", "The SDK has no Solana testnet bridge route.");
  const factories = options.factories ?? providers;
  const secret = (ref: SecretRef | undefined) => resolveSecret(ref, store, options.env ?? process.env);
  const jsonSecret = (ref: SecretRef | undefined): unknown => {
    const value = secret(ref);
    try { return JSON.parse(value); } catch { throw new TradingError("invalid_wallet", "Configured wallet metadata or key shares must contain valid JSON."); }
  };
  const transportFetch = checkpointFetch(chain === "solana" ? "solana" : network === "mainnet" ? "ethereum" : "sepolia", options.fetch);
  try {
    if (wallet.provider === "privy") {
      if (!wallet.walletId) throw new TradingError("invalid_wallet", "Configure an existing Privy wallet ID.");
      const client = await factories.privy({ appId: secret(wallet.appId), appSecret: secret(wallet.appSecret) });
      const identity = await client.wallets().get(wallet.walletId);
      if (identity.id !== wallet.walletId || identity.chain_type !== (chain === "evm" ? "ethereum" : "solana") ||
          !sameAddress(chain, identity.address, wallet.address)) {
        throw new TradingError("wallet_mismatch", "Privy wallet identity does not match the configured chain and address.");
      }
      const { createPrivyEvmClient, createPrivySolanaClient } = await import("@provablehq/aleo-bridge-sdk/privy");
      const config = { client, walletId: wallet.walletId, address: wallet.address,
        ...(wallet.authorizationKey ? { authorizationContext: { authorization_private_keys: [secret(wallet.authorizationKey)] } } : {}) };
      return chain === "evm"
        ? createPrivyEvmClient({ ...config, address: getAddress(wallet.address), transport: evmHttp(wallet.rpcUrl, { fetch: transportFetch }) })
        : createPrivySolanaClient({ ...config, transport: solanaHttp(wallet.rpcUrl, { fetch: transportFetch }) });
    }
    if (wallet.provider !== "dynamic" || !wallet.environmentId) throw new TradingError("invalid_wallet", "Configure a supported hosted wallet provider.");
    const metadata = jsonSecret(wallet.metadata) as DynamicEvmClientConfig["walletMetadata"];
    const expectedChain = chain === "evm" ? "EVM" : "SVM";
    if (!metadata || typeof metadata !== "object" || !metadata.walletId || metadata.chainName !== expectedChain ||
        !sameAddress(chain, metadata.accountAddress, wallet.address)) {
      throw new TradingError("wallet_mismatch", "Dynamic creation metadata does not match the configured wallet.");
    }
    const client = chain === "evm" ? await factories.dynamicEvm(wallet.environmentId) : await factories.dynamicSolana(wallet.environmentId);
    await client.authenticateApiToken(secret(wallet.apiToken));
    const found = await client.getWalletByAddress(wallet.address);
    const solanaAlias = chain === "solana" && found?.chainName === "SOL";
    const addressMatches = found && (sameAddress(chain, found.accountAddress, wallet.address) ||
      (solanaAlias && found.accountAddress === wallet.address.toLowerCase()));
    if (!found || !addressMatches || found.walletId !== metadata.walletId ||
        (found.chainName !== expectedChain && !solanaAlias) ||
        found.thresholdSignatureScheme !== metadata.thresholdSignatureScheme || found.derivationPath !== metadata.derivationPath) {
      throw new TradingError("wallet_mismatch", "Dynamic provider identity does not match the saved creation metadata.");
    }
    if (!wallet.keyShares && !metadata.externalServerKeySharesBackupInfo) {
      throw new TradingError("metadata_required", "Dynamic requires full creation metadata with backup pointers, or configured external key shares.");
    }
    const config = { walletMetadata: metadata,
      ...(wallet.password ? { password: secret(wallet.password) } : {}),
      ...(wallet.keyShares ? { externalServerKeyShares: jsonSecret(wallet.keyShares) as DynamicEvmClientConfig["externalServerKeyShares"] } : {}) };
    const { createDynamicEvmClient, createDynamicSolanaClient } = await import("@provablehq/aleo-bridge-sdk/dynamic");
    return chain === "evm"
      ? createDynamicEvmClient({ ...config, client: client as DynamicEvm, transport: evmHttp(wallet.rpcUrl, { fetch: transportFetch }) })
      : createDynamicSolanaClient({ ...config, client: client as DynamicSolana, chainId: "101", transport: solanaHttp(wallet.rpcUrl, { fetch: transportFetch }) });
  } catch (error) {
    if (["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"].includes(String((error as NodeJS.ErrnoException)?.code))) {
      throw new TradingError("provider_unavailable", "Install this wallet provider's optional dependencies on a supported Node platform.");
    }
    throw error;
  }
}
