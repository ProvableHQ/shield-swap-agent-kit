import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { TradingRuntime } from "./runtime";
import { TradingError, type Kind, type Summary } from "./types";

const id = z.string().min(1).max(128);
const profile = { profileId: id };
const page = { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).default(0) };
const executeArgs = { quoteId: id, idempotencyKey: id };
const operation = { operationId: id };
const tools = {
  setup: { description: "Check onboarding readiness and show trusted terminal setup steps. Never accepts keys or passwords.", schema: z.object({}).strict(), read: true },
  get_config: { description: "Read safe configuration and wallet execution permissions.", schema: z.object({}).strict(), read: true },
  update_config: { description: "Select an existing default profile and default slippage. Permissions and secret settings require terminal setup.", schema: z.object({ defaultProfile: id.optional(), slippageBps: z.number().int().min(0).max(1000).optional() }).strict(), read: false },
  list_wallets: { description: "List configured wallet profiles and public addresses.", schema: z.object({}).strict(), read: true },
  get_wallet_status: { description: "Check configured signing access without submitting a transaction.", schema: z.object(profile).strict(), read: true },
  get_balances: { description: "Read public and private token balances for the configured Aleo account.", schema: z.object({ ...profile, tokens: z.array(id).max(30).optional() }).strict(), read: true },
  list_tokens: { description: "List network token metadata from Shield Swap.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  list_pools: { description: "List Shield Swap pools from the network API.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  quote: { description: "Save an executable exact-input swap quote with its route, minimum output and expiry. Does not submit.", schema: z.object({ ...profile, from: id, to: id, amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).max(100), slippageBps: z.number().int().min(0).max(1000).optional() }).strict(), read: true },
  execute: { description: "Execute a saved swap quote once under locally configured permissions. Returns an operation ID; poll its status.", schema: z.object(executeArgs).strict(), read: false },
  swap_history: { description: "List this account's stored swaps and reconcile claim state. Reports bounded recovery coverage.", schema: z.object({ ...profile, ...page, reconcile: z.boolean().default(false) }).strict(), read: true },
  claim_unclaimed_swaps: { description: "Claim selected unclaimed swap outputs, or a bounded snapshot of up to 20 claimable outputs. Persist per-swap results.", schema: z.object({ ...profile, swapIds: z.array(id).min(1).max(20).optional(), idempotencyKey: id }).strict(), read: false },
  list_bridge_routes: { description: "List SDK bridge routes for the configured network, including availability.", schema: z.object({ ...profile, ...page }).strict(), read: true },
  quote_bridge: { description: "Quote a bridge into another configured wallet in this profile. The route, sender and recipient are bound to the quote.", schema: z.object({ ...profile, sourceChain: z.enum(["aleo", "ethereum", "solana"]), sourceAsset: id, destinationChain: z.enum(["aleo", "ethereum", "solana"]), destinationAsset: id, amount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/).max(100), protocol: z.enum(["hyperlane", "xreserve", "cctp"]).optional() }).strict(), read: true },
  execute_bridge: { description: "Execute a saved bridge quote once, persisting recovery checkpoints.", schema: z.object(executeArgs).strict(), read: false },
  bridge_status: { description: "Read current bridge progress for an existing operation without resubmitting.", schema: z.object(operation).strict(), read: true },
  recover_bridge_transactions: { description: "Reconcile saved bridge checkpoints against the chain. Does not submit; use resume_operation for a required next transaction.", schema: z.object({ ...profile, operationIds: z.array(id).min(1).max(25).optional() }).strict(), read: true },
  get_operation_status: { description: "Inspect and reconcile a saved operation. An uncertain result must never be treated as a failed submission.", schema: z.object(operation).strict(), read: true },
  list_operations: { description: "List persisted operations, optionally for one profile.", schema: z.object({ profileId: id.optional(), limit: z.number().int().min(1).max(100).default(25) }).strict(), read: true },
  resume_operation: { description: "Reconcile and resume a claim or bridge only when the SDK identifies a safe next step. Never repeats a swap deposit.", schema: z.object(operation).strict(), read: false },
} as const;
type ToolName = keyof typeof tools;

function json(value: unknown): Summary {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)) as Summary;
}
export function createTradingServer(runtime?: TradingRuntime): Server {
  const server = new Server({ name: "shield-swap-mcp", version: "0.1.0" }, {
    capabilities: { tools: {} },
    instructions: "Trade through saved quotes and durable operations. setup reports required terminal configuration. Never request keys/passwords in chat. execute returns an operation ID. After uncertainty, inspect that operation; do not create a new swap as a retry. A swap's proceeds require a later claim.",
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
        output = { ready: Boolean(runtime?.profiles().length), unlocked: Boolean(runtime), steps: [
          "Run shield-swap-mcp setup in a trusted terminal to configure a wallet and encrypted state.",
          "Set SHIELD_SWAP_MCP_PASSWORD in the MCP process environment through your secret manager.",
          "Enable bounded execution permissions in terminal setup before executing swaps or bridges.",
        ], deferredTools: ["rebalance_swap_inventory"] };
      } else {
        if (!runtime) throw new TradingError("setup_required", "Wallet state is not unlocked. Run terminal setup and configure the process passphrase.");
        output = await call(runtime, name, args);
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

async function call(runtime: TradingRuntime, name: ToolName, args: Summary): Promise<Summary> {
  const profileId = String(args.profileId ?? "");
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
    case "execute":
    case "execute_bridge": {
      const kind: Kind = name === "execute" ? "swap" : "bridge";
      const quote = runtime.store.get<{ kind: Kind }>("quote:" + String(args.quoteId));
      if (quote?.kind !== kind) throw new TradingError("quote_mismatch", "This quote belongs to a different action or is unavailable.");
      return runtime.execute(String(args.quoteId), String(args.idempotencyKey));
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
    default: return runtime.read(name, profileId, args);
  }
}
