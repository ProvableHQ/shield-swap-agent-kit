import { z } from "zod";
import { getAddress } from "viem";
import { TradingError, type HostedWallet, type SecretRef } from "./types";

const envName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(128);
const common = { address: z.string().min(1).max(128), rpcUrl: z.string().url().max(2048) };
const descriptor = z.discriminatedUnion("provider", [
  z.object({ ...common, provider: z.literal("privy"), walletId: z.string().min(1).max(128),
    appIdEnv: envName, appSecretEnv: envName, authorizationKeyEnv: envName.optional() }).strict(),
  z.object({ ...common, provider: z.literal("dynamic"), environmentId: z.string().regex(/^[A-Za-z0-9-]+$/).max(128),
    apiTokenEnv: envName, metadataEnv: envName, passwordEnv: envName.optional(), keySharesEnv: envName.optional() }).strict(),
]);
const ref = (name: string): SecretRef => ({ type: "env", name });
export function rpcEndpoint(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return value;
  } catch { throw new TradingError("invalid_endpoint", "Use HTTPS endpoints, or HTTP on localhost, without embedded credentials."); }
}
export async function hostedWalletFromEnvironment(chain: "evm" | "solana", name: string, env: NodeJS.ProcessEnv = process.env): Promise<HostedWallet> {
  let data: z.infer<typeof descriptor>;
  try { envName.parse(name); data = descriptor.parse(JSON.parse(env[name] ?? "")); }
  catch { throw new TradingError("invalid_wallet", "Invalid hosted wallet descriptor. Use the documented provider fields and environment references; raw credentials are not accepted."); }
  let address: string;
  try {
    if (chain === "evm") address = getAddress(data.address);
    else { const kit = await import("@solana/kit"); address = kit.address(data.address); }
  } catch { throw new TradingError("invalid_wallet", "The configured wallet address is invalid for its chain."); }
  const base = { provider: data.provider, address, rpcUrl: rpcEndpoint(data.rpcUrl)! };
  return data.provider === "privy"
    ? { ...base, provider: "privy", walletId: data.walletId, appId: ref(data.appIdEnv), appSecret: ref(data.appSecretEnv),
      ...(data.authorizationKeyEnv ? { authorizationKey: ref(data.authorizationKeyEnv) } : {}) }
    : { ...base, provider: "dynamic", environmentId: data.environmentId, apiToken: ref(data.apiTokenEnv), metadata: ref(data.metadataEnv),
      ...(data.passwordEnv ? { password: ref(data.passwordEnv) } : {}), ...(data.keySharesEnv ? { keyShares: ref(data.keySharesEnv) } : {}) };
}
