import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { TradingRuntime } from "./runtime";
import { onboardingStatus, setupSchema } from "./onboarding";
import { TradingError, type Kind, type MaintenanceState, type MaintenanceTarget, type Summary } from "./types";
import { Maintainer, processAlive } from "./maintainer";
import type { MaintenanceLauncher } from "./maintenance-launcher";

const id = z.string().min(1).max(128);
const profile = { profileId: id.optional().describe("Defaults to the configured default profile.") };
const page = { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).default(0) };
const executeArgs = { quoteId: id, idempotencyKey: id };
const operation = { operationId: id };
const decimal = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).max(100);
const tools = {
  setup: { description: "Report account, funding and execution checks for the selected journey. Optional access/balance checks may authenticate and initialize scanner state but never move funds. Never accepts keys or passwords.", schema: setupSchema, read: true },
  get_config: { description: "Read safe configuration and wallet execution permissions.", schema: z.object({}).strict(), read: true },
  update_config: { description: "Select an existing default profile and default slippage. Permissions and secret settings require terminal setup.", schema: z.object({ defaultProfile: id.optional(), slippageBps: z.number().int().min(0).max(1000).optional() }).strict(), read: false },
  list_wallets: { description: "List configured wallet profiles and public addresses.", schema: z.object({}).strict(), read: true },
  get_wallet_status: { description: "Check configured signing access without submitting a transaction.", schema: z.object(profile).strict(), read: true },
  get_balances: { description: "Read public and private token balances for the configured Aleo account.", schema: z.object({ ...profile, tokens: z.array(id).max(30).optional() }).strict(), read: true },
  list_tokens: { description: "List network token metadata from Shield Swap.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  list_pools: { description: "List Shield Swap pools from the network API.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  quote: { description: "Save an executable exact-input swap quote with its route, minimum output and expiry. Does not submit.", schema: z.object({ ...profile, from: id, to: id, amount: decimal, slippageBps: z.number().int().min(0).max(1000).optional() }).strict(), read: true },
  execute: { description: "Execute a saved swap quote once under locally configured permissions. Returns an operation ID; poll its status. count submits that many swaps of the same quote at once, each capped by the token limit, after checking that enough unreserved records cover the input.", schema: z.object({ ...executeArgs, count: z.number().int().min(1).max(1000).default(1) }).strict(), read: false },
  swap_history: { description: "List this account's stored swaps and reconcile claim state. Reports bounded recovery coverage.", schema: z.object({ ...profile, ...page, reconcile: z.boolean().default(false) }).strict(), read: true },
  claim_unclaimed_swaps: { description: "Claim selected unclaimed swap outputs, or a bounded snapshot of up to 20 claimable outputs. Persist per-swap results.", schema: z.object({ ...profile, swapIds: z.array(id).min(1).max(20).optional(), idempotencyKey: id }).strict(), read: false },
  list_bridge_routes: { description: "List SDK bridge routes for the configured network, including availability.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  quote_bridge: { description: "Quote a bridge into another configured wallet in this profile. The route, sender and recipient are bound to the quote.", schema: z.object({ ...profile, sourceChain: z.enum(["aleo", "ethereum", "solana"]), sourceAsset: id, destinationChain: z.enum(["aleo", "ethereum", "solana"]), destinationAsset: id, amount: decimal, protocol: z.enum(["hyperlane", "xreserve", "cctp"]).optional(), mintMode: z.enum(["public", "record", "private"]).optional() }).strict(), read: true },
  execute_bridge: { description: "Execute a saved bridge quote once, persisting recovery checkpoints.", schema: z.object(executeArgs).strict(), read: false },
  bridge_status: { description: "Read current bridge progress for an existing operation without resubmitting.", schema: z.object(operation).strict(), read: true },
  recover_bridge_transactions: { description: "Reconcile saved bridge checkpoints against the chain. Does not submit; use resume_operation for a required next transaction.", schema: z.object({ ...profile, operationIds: z.array(id).min(1).max(25).optional() }).strict(), read: true },
  get_operation_status: { description: "Inspect and reconcile a saved operation. An uncertain result must never be treated as a failed submission.", schema: z.object(operation).strict(), read: true },
  list_operations: { description: "List persisted operations, optionally for one profile.", schema: z.object({ profileId: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict(), read: true },
  resume_operation: { description: "Reconcile and resume a claim or bridge only when the SDK identifies a safe next step. Never repeats a swap deposit.", schema: z.object(operation).strict(), read: false },
  get_record_inventory: { description: "Read one token's spendable private records: available and reserved records with base-unit amounts. Reserves and spends nothing.", schema: z.object({ ...profile, token: id }).strict(), read: true },
  plan_record_inventory: { description: "Plan the joins and splits that reshape one token's private records into the requested count. Saves a reviewable plan ID; submits nothing. minRecordAmount is a human decimal amount.", schema: z.object({ ...profile, token: id, records: z.number().int().min(1).max(1000), minRecordAmount: decimal.optional(), distribution: z.enum(["preserve", "balanced"]).optional(), toleranceBps: z.number().int().min(0).max(10000).optional(), maxTransactions: z.number().int().min(1).max(10000).optional() }).strict(), read: true },
  rebalance_record_inventory: { description: "Execute a saved inventory plan once under the terminal-configured inventory permission and fee limit. Returns an operation ID; poll its status. Accepted joins and splits are never repeated.", schema: z.object({ planId: id, idempotencyKey: id }).strict(), read: false },
  reconcile_record_inventory: { description: "Reconcile this account's record journal against the chain. With rebroadcast, resends saved proved transactions unchanged; that requires inventory permission.", schema: z.object({ ...profile, rebroadcast: z.boolean().default(false) }).strict(), read: false },
  maintain_inventory: { description: "Start a maintainer process that keeps each listed token at a floor of unreserved records covering minRecordAmount (human decimal). It plans only on a shortfall and runs each plan as an inventory operation under the terminal inventory permission and fee limit. The process exits with this server; operators run the maintain command themselves for one that outlives it.", schema: z.object({ ...profile, targets: z.array(z.object({ token: id, records: z.number().int().min(1).max(1000), minRecordAmount: decimal }).strict()).min(1).max(10), intervalSeconds: z.number().int().min(30).max(3600).default(120) }).strict(), read: false },
  stop_maintenance: { description: "Stop the profile's maintainer process. A pass already executing a plan finishes that operation's checkpointed steps through normal reconciliation.", schema: z.object(profile).strict(), read: false },
  get_maintenance_status: { description: "Read the profile's maintainer state: targets, interval, whether its process is alive, and the last pass's ready counts, action and error.", schema: z.object(profile).strict(), read: true },
} as const;
type ToolName = keyof typeof tools;

function json(value: unknown): Summary {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Summary;
}
export function createTradingServer(runtime?: TradingRuntime, options: { stateExists?: boolean; launcher?: MaintenanceLauncher } = {}): Server {
  const server = new Server({ name: "shield-swap-mcp", version: "0.1.0" }, {
    capabilities: { tools: {} },
    instructions: "Trade through saved quotes and durable operations. setup reports required terminal configuration. Never request keys/passwords in chat. execute returns an operation ID. After uncertainty, inspect that operation; do not create a new swap as a retry. A swap's proceeds require a later claim. Record inventory tools inspect, plan and rebalance private records; one operation runs per wallet at a time.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, definition]) => ({
      name, description: definition.description,
      inputSchema: z.toJSONSchema(definition.schema) as { type: "object"; properties: Record<string, unknown> },
      annotations: { readOnlyHint: definition.read, destructiveHint: !definition.read, openWorldHint: true },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    let output: Summary;
    let isError = false;
    try {
      const name = request.params.name as ToolName;
      if (!Object.hasOwn(tools, name)) throw new TradingError("unknown_tool", "Unknown tool.");
      const parsed = tools[name].schema.safeParse(request.params.arguments ?? {});
      if (!parsed.success) throw new TradingError("invalid_arguments", "Invalid tool arguments. Check the tool schema; keys and permission grants are never accepted.");
      const args = parsed.data as Summary;
      if (name === "setup") {
        output = await onboardingStatus(runtime, setupSchema.parse(args), options.stateExists);
      } else {
        if (!runtime) throw new TradingError("setup_required", "Wallet state is not unlocked. Run terminal setup and configure the process passphrase.");
        output = await call(runtime, name, args, options.launcher);
      }
    } catch (error) {
      isError = true;
      output = { error: error instanceof TradingError ? { code: error.code, message: error.message } : { code: "unavailable", message: "The operation could not be completed. Inspect wallet readiness or the original operation status. No automatic transaction retry was performed." } };
    }
    const safe = json(output);
    return { structuredContent: safe, content: [{ type: "text" as const, text: JSON.stringify(safe) }], isError };
  });
  return server;
}

async function call(runtime: TradingRuntime, name: ToolName, args: Summary, launcher?: MaintenanceLauncher): Promise<Summary> {
  const profileId = String(args.profileId ?? runtime.store.get<Summary>("settings")?.defaultProfile ?? "default");
  switch (name) {
    case "get_config": return { profiles: runtime.profiles(), defaults: runtime.store.get("settings") ?? {} };
    case "update_config": {
      if (args.defaultProfile) runtime.profile(String(args.defaultProfile));
      const current = runtime.store.get<Summary>("settings") ?? {};
      runtime.store.set("settings", { ...current, ...args });
      return { defaults: { ...current, ...args } };
    }
    case "list_wallets": return { wallets: runtime.profiles() };
    case "quote":
    case "quote_bridge": return runtime.quote(name === "quote" ? "swap" : "bridge", profileId, args);
    case "plan_record_inventory": {
      const plan = await runtime.quote("inventory", profileId, args);
      return { planId: plan.quoteId, ...plan };
    }
    case "execute":
    case "execute_bridge":
    case "rebalance_record_inventory": {
      const kind: Kind = name === "execute" ? "swap" : name === "execute_bridge" ? "bridge" : "inventory";
      const quoteId = String(name === "rebalance_record_inventory" ? args.planId : args.quoteId);
      const quote = runtime.store.get<{ kind: Kind }>("quote:" + quoteId);
      if (quote?.kind !== kind) throw new TradingError("quote_mismatch", "This quote belongs to a different action or is unavailable.");
      return runtime.execute(quoteId, String(args.idempotencyKey), name === "execute" ? Number(args.count ?? 1) : 1);
    }
    case "get_operation_status": return runtime.status(String(args.operationId));
    case "bridge_status":
      if (runtime.operation(String(args.operationId)).kind !== "bridge") throw new TradingError("operation_mismatch", "This is not a bridge operation.");
      return runtime.status(String(args.operationId));
    case "list_operations": return { operations: runtime.operations(args.profileId as string | undefined, Number(args.limit)) };
    case "resume_operation": return runtime.resume(String(args.operationId));
    case "recover_bridge_transactions": {
      const ids = args.operationIds as string[] | undefined ?? runtime.operations(profileId, 100).filter(op => op.kind === "bridge").slice(0, 25).map(op => String(op.operationId));
      const results: Summary[] = [];
      for (const id of ids) {
        const op = runtime.operation(id);
        if (op.kind !== "bridge" || op.profileId !== profileId) throw new TradingError("operation_mismatch", "Bridge operation does not belong to this profile.");
        results.push(await runtime.status(id));
      }
      return { operations: results };
    }
    case "claim_unclaimed_swaps": {
      const profile = runtime.profile(profileId);
      const intent = createHash("sha256").update(JSON.stringify({ profileId, swapIds: args.swapIds ?? null })).digest("hex");
      const key = "claim-request:" + createHash("sha256").update(runtime.scope(profile) + ":" + String(args.idempotencyKey)).digest("hex");
      return runtime.store.withLock("claim-intent:" + runtime.scope(profile), async () => {
        const existing = runtime.store.get<{ intent: string; quoteId: string }>(key);
        if (existing && existing.intent !== intent) throw new TradingError("idempotency_conflict", "This key was already used for a different claim request.");
        const quoteId = existing?.quoteId ?? String((await runtime.quote("claim", profileId, args)).quoteId);
        if (!existing) runtime.store.set(key, { intent, quoteId });
        return runtime.execute(quoteId, String(args.idempotencyKey));
      });
    }
    case "maintain_inventory": {
      const profile = runtime.profile(profileId);
      if (!profile.policy.inventory) throw new TradingError("permission_required", "Inventory maintenance permission must be enabled in terminal setup.");
      if (!launcher) throw new TradingError("unavailable", "This server cannot launch a maintainer process.");
      const existing = runtime.store.get<MaintenanceState>(Maintainer.stateKey(profileId));
      if (existing?.running && processAlive(existing.pid)) throw new TradingError("maintainer_running", `A maintainer for this profile is already running as pid ${existing.pid}; stop it first.`);
      const targets = (args.targets as MaintenanceTarget[]).map(target => ({ token: String(target.token), records: Number(target.records), minRecordAmount: String(target.minRecordAmount) }));
      const intervalSeconds = Number(args.intervalSeconds ?? 120);
      const { pid } = launcher.launch({ profileId, targets, intervalSeconds });
      const state: MaintenanceState = { profileId, pid, startedAt: Date.now(), intervalSeconds, targets, running: true, ...(existing?.lastPass ? { lastPass: existing.lastPass } : {}) };
      runtime.store.set(Maintainer.stateKey(profileId), state);
      return { ...state, alive: processAlive(pid) };
    }
    case "stop_maintenance": {
      const state = runtime.store.get<MaintenanceState>(Maintainer.stateKey(profileId));
      if (!state) throw new TradingError("maintenance_missing", "No maintainer has been started for this profile.");
      if (state.running) launcher?.stop(state.pid);
      const stopped = { ...state, running: false };
      runtime.store.set(Maintainer.stateKey(profileId), stopped);
      return { ...stopped, alive: processAlive(state.pid) };
    }
    case "get_maintenance_status": {
      const state = runtime.store.get<MaintenanceState>(Maintainer.stateKey(profileId));
      if (!state) return { profileId, running: false, alive: false, targets: [] };
      return { ...state, alive: state.running && processAlive(state.pid) };
    }
    default: return runtime.read(name, profileId, args);
  }
}
