import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { withWalletLocks } from "./coordination";
import type { TradingRuntime } from "./runtime";
import { TradingError, type Policy, type Profile, type Summary } from "./types";

const name = z.string().regex(/^[^=\s]{1,128}$/);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
export const permissionRequestSchema = z.object({
  profileId: z.string().min(1).max(128).optional(),
  permissions: z.object({ swaps: z.boolean().optional(), claims: z.boolean().optional(),
    bridges: z.boolean().optional(), inventory: z.boolean().optional() }).strict().optional(),
  swapLimits: z.array(z.object({ token: name, amount }).strict()).max(30).optional(),
  bridgeLimits: z.array(z.object({ asset: name, amount }).strict()).max(30).optional(),
  maxSlippageBps: z.number().int().min(0).max(1000).optional(),
}).strict().superRefine((value, ctx) => {
  if (!Object.keys(value.permissions ?? {}).length && !value.swapLimits?.length && !value.bridgeLimits?.length && value.maxSlippageBps === undefined) {
    ctx.addIssue({ code: "custom", message: "Propose at least one permission or limit." });
  }
  for (const keys of [value.swapLimits?.map(limit => limit.token), value.bridgeLimits?.map(limit => limit.asset)]) {
    if (keys && new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate limit." });
  }
});
type PermissionRequest = z.infer<typeof permissionRequestSchema>;

function updatedPolicy(current: Policy, input: PermissionRequest): Policy {
  return { ...current, inventory: current.inventory ?? false, ...input.permissions,
    swapLimits: { ...current.swapLimits, ...Object.fromEntries((input.swapLimits ?? []).map(limit => [limit.token, limit.amount])) },
    bridgeLimits: { ...current.bridgeLimits, ...Object.fromEntries((input.bridgeLimits ?? []).map(limit => [limit.asset, limit.amount])) },
    maxSlippageBps: input.maxSlippageBps ?? current.maxSlippageBps };
}

function terminalCommand(runtime: TradingRuntime, profile: Profile, input: PermissionRequest): string {
  const args = ["configure", "--state-dir", runtime.store.directory, "--profile", profile.id];
  for (const [permission, enabled] of Object.entries(input.permissions ?? {})) args.push(`--${enabled ? "allow" : "deny"}-${permission}`);
  for (const limit of input.swapLimits ?? []) args.push("--swap-limit", `${limit.token}=${limit.amount}`);
  for (const limit of input.bridgeLimits ?? []) args.push("--bridge-limit", `${limit.asset}=${limit.amount}`);
  if (input.maxSlippageBps !== undefined) args.push("--max-slippage-bps", String(input.maxSlippageBps));
  // Quote every value, including profile IDs and state directories controlled by the operator.
  return "shield-swap-mcp " + args.map(arg => "'" + arg.replaceAll("'", "'\\''") + "'").join(" ");
}

/** Tool arguments propose a change; only the client's separate elicitation response can approve it. */
export async function requestPermissions(runtime: TradingRuntime, server: Server, input: PermissionRequest,
  request: { signal: AbortSignal; requestId: string | number }): Promise<Summary> {
  const profileId = input.profileId ?? String(runtime.store.get<Summary>("settings")?.defaultProfile ?? "default");
  const profile = runtime.profile(profileId);
  const current = { ...profile.policy, inventory: profile.policy.inventory ?? false };
  const proposed = updatedPolicy(current, input);
  const details = { profileId, network: profile.network, address: profile.address, currentPolicy: current, proposedPolicy: proposed,
    scope: "persistent_profile", limitsScope: "per_operation" };
  if (JSON.stringify(current) === JSON.stringify(proposed)) return { ...details, status: "unchanged", approved: false };
  const fallback = { ...details, status: "requires_terminal", approved: false, command: terminalCommand(runtime, profile, input),
    guidance: "This client has no confirmation form. Have the user review and run this command in a trusted terminal (or use node dist/cli.js from the built MCP package). Use the same state passphrase; never put secrets in chat." };
  if (!server.getClientCapabilities()?.elicitation?.form) return fallback;

  const message = ["Review persistent Shield Swap execution access.",
    `Profile: ${profileId}; network: ${profile.network}; Aleo account: ${profile.address}.`,
    ...(profile.evm ? [`Ethereum account: ${profile.evm.address}.`] : []),
    ...(profile.solana ? [`Solana account: ${profile.solana.address}.`] : []),
    `Current policy: ${JSON.stringify(current)}`, `Proposed policy: ${JSON.stringify(proposed)}`,
    "Approval persists for this profile across sessions until revoked; it is not approval of one transaction. Limits are base-unit caps per operation, not a total spending budget. A zero or missing token cap blocks that token. Slippage is in basis points.",
    "Swaps spend private records; claims submit transactions to collect swap outputs; bridges move funds between the configured accounts.",
    "Inventory access allows joins, splits, rebroadcast of saved proved transactions, and ongoing transactions by enabled maintenance jobs. It has no separate fee or total budget cap. Previously enabled jobs can resume when this permission is restored.",
    "This request changes access only; it does not submit a transaction or start a maintenance job. You can revoke access with request_permissions or terminal configure --deny-*.",
  ].join("\n");
  const response = await server.elicitInput({ mode: "form", message,
    requestedSchema: { type: "object", properties: { approve: { type: "boolean", title: "Approve this persistent policy change", default: false } }, required: ["approve"] },
  }, { signal: request.signal, relatedRequestId: request.requestId });
  if (response.action !== "accept" || response.content?.approve !== true) {
    return { ...details, status: response.action === "cancel" ? "cancelled" : "declined", approved: false };
  }
  // Never hold a wallet or database lock while waiting for user input.
  request.signal.throwIfAborted();
  await withWalletLocks(runtime.store, [profile], async () => runtime.store.transaction(() => {
    request.signal.throwIfAborted();
    if (JSON.stringify(runtime.store.get<Profile>("profile:" + profileId)) !== JSON.stringify(profile)) {
      throw new TradingError("profile_changed", "This profile changed while approval was pending. Inspect get_config and request a fresh approval.");
    }
    if (runtime.store.list<{ profileId: string; status: string }>("operation:").some(op => op.profileId === profileId && ["queued", "running", "submitted"].includes(op.status))) {
      throw new TradingError("operation_pending", "Wait for this profile's active operation before changing its permissions.");
    }
    runtime.store.set("profile:" + profileId, { ...profile, policy: proposed });
  }));
  return { ...details, status: "approved", approved: true,
    guidance: "Access saved. Check current quote terms and operation status before continuing; no transaction was submitted or retried." };
}
