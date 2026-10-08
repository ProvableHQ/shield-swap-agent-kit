import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { emitKeypressEvents, type Key } from "node:readline";
import { parseArgs } from "node:util";
import { TradingStore } from "./trading/store";
import { withWalletLocks } from "./trading/coordination";
import { hostedWalletFromEnvironment, rpcEndpoint as endpoint } from "./trading/wallet-config";
import { TradingError, type Profile, type Policy, type HostedWallet } from "./trading/types";

export const help = `Shield Swap MCP
  shield-swap-mcp setup --guided
  shield-swap-mcp setup --network mainnet --key-env ALEO_PRIVATE_KEY
  shield-swap-mcp configure --profile default --allow-claims
  shield-swap-mcp serve

setup --guided reuses the selected profile or offers import/create in a trusted
terminal. New guided profiles default to mainnet; existing profiles retain their
configuration. Explicit --network overrides apply only to new profiles.

setup imports an existing local Aleo wallet. With no --key-env, a hidden
terminal prompt imports the key into encrypted storage. --store-key copies
the named environment key into encrypted storage; otherwise the MCP host
must supply that environment variable. --generate explicitly creates a new
wallet and stores its key encrypted. Setup never authenticates or trades.

Common options:
  --state-dir PATH         Encrypted state (default ~/.shield-swap-mcp)
  --profile NAME           Profile name (default default)
  --guided                Guide account selection; reuse an existing profile
  --network mainnet|testnet  Required except for guided setup
  --key-env NAME           Environment variable containing an existing key
  --store-key              Store the environment key encrypted
  --generate               Create a new wallet instead of importing
  --network-url URL        Aleo RPC override (setup only)
  --api-url URL            Shield Swap API override (setup only)
  --fee-master             Request the delegated prover's fee sponsorship
  --no-fee-master          Pay Aleo fees from the wallet (configure only)

configure changes trusted terminal permissions:
  --allow-swaps / --deny-swaps
  --allow-claims / --deny-claims
  --allow-bridges / --deny-bridges
  --swap-limit TOKEN=RAW   Per-operation base-unit input cap (repeatable)
  --bridge-limit ASSET=RAW Per-operation base-unit input cap (repeatable)
  --max-slippage-bps N     Maximum swap slippage (0–1000)
  --evm-key-env NAME --evm-rpc-url URL
  --solana-key-env NAME --solana-rpc-url URL
                          Configure existing bridge wallets from environment keys
  --evm-wallet-env NAME / --solana-wallet-env NAME
                          Hosted wallet descriptor JSON with credential references

New profiles have execution disabled. Setup/configure require a hidden
passphrase prompt or SHIELD_SWAP_MCP_PASSWORD from your secret manager.
serve uses SHIELD_SWAP_MCP_PASSWORD and never prompts on MCP stdin.
Never pass a key or passphrase as a command argument. Back up encrypted
state and keep its passphrase separately. Use one state directory per wallet.
`;

export function argumentsFor(argv: string[]) {
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      help: { type: "boolean", short: "h" },
      "state-dir": { type: "string" }, profile: { type: "string" }, network: { type: "string" },
      "key-env": { type: "string" }, "store-key": { type: "boolean" }, generate: { type: "boolean" }, guided: { type: "boolean" },
      "network-url": { type: "string" }, "api-url": { type: "string" }, "fee-master": { type: "boolean" }, "no-fee-master": { type: "boolean" },
      "allow-swaps": { type: "boolean" }, "deny-swaps": { type: "boolean" },
      "allow-claims": { type: "boolean" }, "deny-claims": { type: "boolean" },
      "allow-bridges": { type: "boolean" }, "deny-bridges": { type: "boolean" },
      "swap-limit": { type: "string", multiple: true }, "bridge-limit": { type: "string", multiple: true },
      "max-slippage-bps": { type: "string" },
      "evm-key-env": { type: "string" }, "evm-rpc-url": { type: "string" },
      "solana-key-env": { type: "string" }, "solana-rpc-url": { type: "string" },
      "evm-wallet-env": { type: "string" }, "solana-wallet-env": { type: "string" },
    } });
    const command = parsed.positionals[0] ?? "serve";
    if (parsed.positionals.length > 1 || !["setup", "configure", "serve"].includes(command)) throw new Error();
    const allowed = command === "setup" ? new Set(["help", "state-dir", "profile", "network", "guided", "key-env", "store-key", "generate", "network-url", "api-url", "fee-master"])
      : command === "configure" ? new Set(["help", "state-dir", "profile", "fee-master", "no-fee-master", "allow-swaps", "deny-swaps", "allow-claims", "deny-claims", "allow-bridges", "deny-bridges", "swap-limit", "bridge-limit", "max-slippage-bps", "evm-key-env", "evm-rpc-url", "solana-key-env", "solana-rpc-url", "evm-wallet-env", "solana-wallet-env"])
      : new Set(["help", "state-dir"]);
    if (Object.keys(parsed.values).some(key => !allowed.has(key))) throw new Error();
    return { command, values: parsed.values };
  } catch {
    throw new TradingError("invalid_arguments", "Invalid command arguments. Use --help; keys and passphrases must never be passed as arguments.");
  }
}
type Options = ReturnType<typeof argumentsFor>["values"];
export function stateDirectory(options: Options): string {
  return resolve(options["state-dir"] ?? process.env.SHIELD_SWAP_MCP_STATE_DIR ?? join(homedir(), ".shield-swap-mcp"));
}

async function hiddenInput(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new TradingError("terminal_required", "Use a trusted terminal prompt or configure the required environment variables.");
  process.stderr.write(label);
  emitKeypressEvents(process.stdin);
  const previousRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolveInput, reject) => {
    let value = "";
    const finish = (cancelled = false) => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(previousRaw);
      process.stdin.pause();
      process.stderr.write("\n");
      if (cancelled) reject(new TradingError("cancelled", "Terminal setup cancelled."));
      else resolveInput(value);
    };
    const onKey = (text: string, key: Key) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) return finish(true);
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace") { value = value.slice(0, -1); return; }
      if (!key.ctrl && !key.meta && text && !text.includes("\u001b")) value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}
async function password(directory: string): Promise<string> {
  const configured = process.env.SHIELD_SWAP_MCP_PASSWORD;
  if (configured) return configured;
  const value = await hiddenInput("Account passphrase (hidden): ");
  if (!existsSync(join(directory, "state.sqlite")) && value !== await hiddenInput("Repeat passphrase (hidden): ")) {
    throw new TradingError("passphrase_mismatch", "The passphrases did not match.");
  }
  return value;
}
function profileId(options: Options): string {
  const id = options.profile ?? "default";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new TradingError("invalid_profile", "Use 1–64 letters, digits, hyphens or underscores for a profile.");
  return id;
}
const readOnlyPolicy = (): Policy => ({ swaps: false, claims: false, bridges: false, maxSlippageBps: 100, swapLimits: {}, bridgeLimits: {} });

export async function setup(options: Options): Promise<Record<string, unknown>> {
  let id = profileId(options);
  const network = options.network ?? (options.guided ? "mainnet" : undefined);
  if (network !== "mainnet" && network !== "testnet") throw new TradingError("network_required", "Setup requires --network mainnet or --network testnet.");
  const keyEnv = options["key-env"];
  if (keyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new TradingError("invalid_key_env", "--key-env must name an environment variable.");
  if ((options.generate && (keyEnv || options["store-key"])) || (options["store-key"] && !keyEnv)) throw new TradingError("invalid_arguments", "Choose one key source: environment, hidden prompt, or --generate.");
  const networkUrl = endpoint(options["network-url"]), apiUrl = endpoint(options["api-url"]);
  const directory = stateDirectory(options);
  const passphrase = await password(directory);
  const store = new TradingStore(directory, passphrase, true);
  try {
    if (options.guided && !options.profile) {
      const selected = store.get<{ defaultProfile?: string }>("settings")?.defaultProfile;
      if (selected) id = profileId({ profile: selected });
    }
    const existing = store.get<Profile>("profile:" + id);
    if (existing) {
      const changesRequested = options.generate || keyEnv || options["store-key"] || options["network-url"] || options["api-url"] || options["fee-master"] || (options.network && options.network !== existing.network);
      if (!options.guided || changesRequested) throw new TradingError("profile_exists", "This profile already exists. Use configure to change its permissions, or choose a new profile name.");
      return { profileId: id, network: existing.network, address: existing.address, reused: true, nextAction: "check_funding", policy: existing.policy };
    }
    let generate = Boolean(options.generate);
    if (options.guided && !generate && !keyEnv) {
      const choice = await hiddenInput("Configure an Aleo account for Shield Swap\n  1. Import an existing account\n  2. Create a new account\nEnter 1 or 2, then press Return: ");
      if (!["1", "2"].includes(choice.trim())) throw new TradingError("account_choice_required", "Choose import or create to continue. No account was created.");
      generate = choice.trim() === "2";
    }
    const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
    const sdk = await loadNetwork(network);
    const key = generate ? undefined : keyEnv ? process.env[keyEnv] : await hiddenInput("Existing Aleo private key (hidden): ");
    if (!generate && !key) throw new TradingError("key_missing", "The selected environment variable has no key.");
    let account;
    try { account = generate ? sdk.generateAccount() : sdk.privateKeyToAccount(key!); }
    catch { throw new TradingError("invalid_key", "The configured Aleo key is invalid."); }
    const persistKey = !keyEnv || Boolean(options["store-key"]);
    const secretId = "aleo:" + id;
    const profile: Profile = { id, network, address: account.address,
      key: persistKey ? { type: "stored", id: secretId } : { type: "env", name: keyEnv! },
      networkUrl, apiUrl, useFeeMaster: Boolean(options["fee-master"]), policy: readOnlyPolicy() };
    store.transaction(() => {
      // SDK loading or a hidden prompt can yield while another process sets up.
      // Recheck under the SQLite write transaction before storing either key.
      if (store.get("profile:" + id)) throw new TradingError("profile_exists", "This profile was configured concurrently. Its existing key and profile were preserved.");
      if (persistKey) store.set("secret:" + secretId, account.privateKey);
      store.set("profile:" + id, profile);
      if (!store.get("settings")) store.set("settings", { defaultProfile: id, slippageBps: 50 });
    });
    return { profileId: id, network, address: account.address, reused: false, nextAction: "check_funding", keyStorage: persistKey ? "encrypted" : "environment", stateDirectory: directory, useFeeMaster: profile.useFeeMaster, policy: profile.policy };
  } finally { store.close(); }
}

async function localBridgeWallet(chain: "evm" | "solana", options: Options): Promise<HostedWallet | undefined> {
  const keyEnv = options[chain === "evm" ? "evm-key-env" : "solana-key-env"];
  const rpcUrl = endpoint(options[chain === "evm" ? "evm-rpc-url" : "solana-rpc-url"]);
  const hostedEnv = options[chain === "evm" ? "evm-wallet-env" : "solana-wallet-env"];
  if (hostedEnv) {
    if (keyEnv || rpcUrl) throw new TradingError("invalid_wallet", "Choose either local key options or a hosted wallet descriptor.");
    return hostedWalletFromEnvironment(chain, hostedEnv);
  }
  if (!keyEnv && !rpcUrl) return undefined;
  if (!keyEnv || !rpcUrl || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new TradingError("invalid_wallet", "Supply both the bridge key environment variable name and its RPC URL.");
  const key = process.env[keyEnv];
  if (!key) throw new TradingError("key_missing", "The bridge wallet key environment variable is not set.");
  let address: string;
  try {
    if (chain === "evm") {
      const { privateKeyToAccount } = await import("viem/accounts");
      address = privateKeyToAccount((key.startsWith("0x") ? key : "0x" + key) as import("viem").Hex).address;
    } else {
      const parsed: unknown = JSON.parse(key);
      if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error();
      const { createSolanaClient, solanaHttp, solanaKeyPair } = await import("@provablehq/aleo-bridge-sdk");
      const client = createSolanaClient({ transport: solanaHttp(rpcUrl), account: solanaKeyPair(Uint8Array.from(parsed)) });
      address = await client.walletClient!.getAddress();
    }
  } catch { throw new TradingError("invalid_key", "The bridge wallet key is invalid. Solana expects a JSON array of 64 bytes."); }
  return { provider: "local", address, rpcUrl, key: { type: "env", name: keyEnv } };
}

export async function configure(options: Options): Promise<Record<string, unknown>> {
  const id = profileId(options), directory = stateDirectory(options);
  const store = new TradingStore(directory, await password(directory));
  try {
    const profile = store.get<Profile>("profile:" + id);
    if (!profile) throw new TradingError("profile_missing", "Profile does not exist; run setup first.");
    const [evm, solana] = await Promise.all([localBridgeWallet("evm", options), localBridgeWallet("solana", options)]);
    if (solana && profile.network !== "mainnet") throw new TradingError("unsupported_network", "The SDK registry has no Solana testnet bridge route.");
    const policy = structuredClone(profile.policy);
    for (const permission of ["swaps", "claims", "bridges"] as const) {
      const allow = options[("allow-" + permission) as "allow-swaps"];
      const deny = options[("deny-" + permission) as "deny-swaps"];
      if (allow && deny) throw new TradingError("invalid_arguments", "Cannot both allow and deny the same permission.");
      if (allow || deny) policy[permission] = Boolean(allow);
    }
    for (const [option, target] of [["swap-limit", policy.swapLimits], ["bridge-limit", policy.bridgeLimits]] as const) {
      for (const entry of options[option] ?? []) {
        const match = /^([^=\s]{1,128})=(0|[1-9][0-9]{0,77})$/.exec(entry);
        if (!match) throw new TradingError("invalid_limit", "Limits must be TOKEN=RAW using nonnegative integer base units; zero disables that token.");
        target[match[1]] = match[2];
      }
    }
    if (options["max-slippage-bps"] !== undefined) {
      const value = Number(options["max-slippage-bps"]);
      if (!/^\d+$/.test(options["max-slippage-bps"]) || !Number.isInteger(value) || value < 0 || value > 1000) throw new TradingError("invalid_slippage", "Slippage must be a whole number from 0 to 1000 basis points.");
      policy.maxSlippageBps = value;
    }
    if (options["fee-master"] && options["no-fee-master"]) throw new TradingError("invalid_arguments", "Choose either sponsored or wallet-funded Aleo fees.");
    const useFeeMaster = options["fee-master"] ? true : options["no-fee-master"] ? false : profile.useFeeMaster ?? false;
    const updated = { ...profile, useFeeMaster, ...(evm ? { evm } : {}), ...(solana ? { solana } : {}), policy };
    await withWalletLocks(store, [profile, updated], async () => store.transaction(() => {
      if (store.list<{ profileId: string; status: string }>("operation:").some(op => op.profileId === id && ["queued", "running"].includes(op.status))) {
        throw new TradingError("operation_pending", "Wait for the profile's active operation before changing its permissions.");
      }
      const current = store.get<Profile>("profile:" + id)!;
      if (JSON.stringify(current) !== JSON.stringify(profile)) throw new TradingError("profile_changed", "This profile changed during configuration; rerun configure.");
      store.set("profile:" + id, updated);
    }));
    return { profileId: id, policy, useFeeMaster, ...(evm ? { ethereumAddress: evm.address } : {}), ...(solana ? { solanaAddress: solana.address } : {}) };
  } finally { store.close(); }
}
