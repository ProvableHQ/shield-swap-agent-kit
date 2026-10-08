import { z } from "zod";
import { renderWelcome } from "../../../tools/welcome.mjs";
import type { TradingRuntime } from "./runtime";
import type { Summary } from "./types";

export const setupSchema = z.object({
  profileId: z.string().min(1).max(128).optional(),
  journey: z.enum(["trade_now", "connect_trading_tools", "build_strategy", "explore_markets"]).optional(),
  mode: z.enum(["guided", "unattended"]).default("guided"),
  checkAccess: z.boolean().default(false).describe("Verify signing and API access; may authenticate and initialize scanner state."),
  checkBalances: z.boolean().default(false).describe("Also verify access and read private balances; does not move funds."),
  funding: z.object({
    tokenId: z.string().min(1).max(128),
    amount: z.string().regex(/^[1-9][0-9]{0,77}$/).describe("Required private input in integer base units, not a human decimal amount."),
  }).strict().optional().describe("Optional intended funding requirement; implies checkBalances."),
}).strict();

type Check = { status: string; [key: string]: unknown };
export type SetupReport = {
  schemaVersion: 1;
  journey?: z.infer<typeof setupSchema>["journey"];
  mode: "guided" | "unattended";
  unlocked: boolean;
  profileId?: string;
  checks: { tools: Check; account: Check; funding: Check; execution: Check };
  completedCheckpoints: string[];
  nextAction: string;
  steps: string[];
  deferredTools: string[];
};

const guidance: Record<string, string> = {
  configure_account: "Use shield-swap-mcp setup --guided in a trusted terminal (or node dist/cli.js setup --guided from the built mcp directory). Reuse the intended account; never paste keys into chat. Restart the MCP process with its required secret references afterward.",
  unlock_account: "Supply SHIELD_SWAP_MCP_PASSWORD and any configured key environment references through the MCP host's secret manager, then restart this process. Do not create a replacement account.",
  verify_account_access: "Call setup with checkAccess: true, or checkBalances: true to verify access and holdings together.",
  restore_account_access: "Check this profile's signing credentials and API access, then repeat the access check. Preserve its account and recovery state.",
  check_funding: "Call setup with checkBalances: true. If known, include funding.tokenId and funding.amount in integer base units for the intended input.",
  fund_account: "Use the selected account's existing assets or an authorized transfer/bridge. Discover supported bridge routes first, retain the operation ID, and verify destination private holdings before continuing.",
  restore_balance_access: "Check scanner and token availability, then read private balances again. An unavailable read does not mean funds are missing; inspect existing funding operations before transferring more.",
  continue_journey: "Continue the selected journey using this account and state. Integration and strategy verification remain separate steps; check records, fees, quote terms and execution limits before an authorized trade.",
};

/** No provisioning or transaction execution. Remote checks are explicitly requested. */
export async function onboardingStatus(runtime: TradingRuntime | undefined, input: z.infer<typeof setupSchema>, stateExists = false): Promise<SetupReport & { guidance: string; welcome: string }> {
  const report = await inspectOnboarding(runtime, input, stateExists);
  return { ...report, guidance: guidance[report.nextAction], welcome: renderWelcome(report) };
}

async function inspectOnboarding(
  runtime: TradingRuntime | undefined,
  input: z.infer<typeof setupSchema>,
  stateExists = false,
): Promise<SetupReport> {
  const report: SetupReport = {
    schemaVersion: 1, journey: input.journey, mode: input.mode, unlocked: Boolean(runtime),
    checks: {
      tools: { status: "available", interface: "mcp" },
      account: { status: stateExists && !runtime ? "locked" : "missing" },
      funding: { status: "not_checked", scope: "aggregate_private_balance", spendability: "not_verified", fees: "not_checked" },
      execution: { status: "not_checked" },
    },
    completedCheckpoints: ["tools_available"],
    nextAction: stateExists && !runtime ? "unlock_account" : "configure_account",
    steps: ["Configure an Aleo account for Shield Swap", "Fund your account"],
    deferredTools: ["rebalance_swap_inventory"],
  };
  if (!runtime) return report;
  const profileId = input.profileId ?? runtime.store.get<Summary>("settings")?.defaultProfile ?? "default";
  report.profileId = String(profileId);
  const profiles = runtime.profiles();
  if (!profiles.some(profile => profile.id === profileId)) {
    report.checks.account.availableProfiles = profiles.map(profile => ({ profileId: profile.id, address: profile.address }));
    return report;
  }
  const profile = runtime.profile(String(profileId));
  report.checks.account = { status: "configured", profileId: profile.id, address: profile.address, network: profile.network };
  report.checks.execution = {
    status: profile.policy.swaps && profile.policy.claims && Object.values(profile.policy.swapLimits).some(value => BigInt(value) > 0n) ? "bounded" : "disabled",
    policy: profile.policy,
    scope: "per_operation_only",
    note: "Token caps, slippage, fees, records and the executable quote still need checking for each trade. Unattended total budgets require a worker policy.",
  };
  report.completedCheckpoints.push("account_configured");
  report.nextAction = "verify_account_access";
  if (!input.checkAccess && !input.checkBalances && !input.funding) return report;
  try {
    const status = await runtime.read("get_wallet_status", profile.id, {});
    if (status.signerReady !== true || status.address !== profile.address || status.network !== profile.network) throw new Error("Account verification failed");
    report.checks.account.status = "usable";
    report.completedCheckpoints.push("account_access_verified");
  } catch {
    report.checks.account.status = "unavailable";
    report.checks.account.message = "Could not verify this account's signing and API access. Check its configuration without replacing it.";
    report.nextAction = "restore_account_access";
    return report;
  }
  report.nextAction = input.journey === "explore_markets" ? "continue_journey" : "check_funding";
  if (!input.checkBalances && !input.funding) return report;
  try {
    const result = await runtime.read("get_balances", profile.id, input.funding ? { tokens: [input.funding.tokenId] } : {});
    if (result.address !== profile.address || result.network !== profile.network || !Array.isArray(result.balances)) throw new Error("Invalid balances");
    const balances = result.balances.map((row: unknown) => {
      if (!row || typeof row !== "object") throw new Error("Invalid balance");
      const value = row as Summary;
      if (typeof value.tokenId !== "string" || typeof value.private !== "string" || !/^\d+$/.test(value.private) || typeof value.public !== "string" || !/^\d+$/.test(value.public)) throw new Error("Invalid balance");
      return { tokenId: value.tokenId, private: value.private, public: value.public };
    });
    const target = input.funding;
    const matching = target ? balances.filter(row => row.tokenId === target.tokenId) : [];
    // A requested token must resolve to exactly one row. Missing metadata or
    // malformed responses must not be interpreted as a zero balance.
    if (target && matching.length !== 1) throw new Error("Required token missing");
    const sufficient = target ? BigInt(matching[0].private) >= BigInt(target.amount) : balances.some(row => BigInt(row.private) > 0n);
    report.checks.funding = {
      ...report.checks.funding, status: sufficient ? "available" : "insufficient", balances,
      ...(target ? { requirement: target } : {}),
      observedAt: new Date().toISOString(),
      note: "Private aggregate holdings only; this does not prove a covering unspent record, fee capacity, or readiness to execute a particular swap.",
    };
    report.completedCheckpoints.push("funding_checked");
    if (sufficient) report.completedCheckpoints.push("private_balance_observed");
    report.nextAction = input.journey === "explore_markets" || sufficient ? "continue_journey" : "fund_account";
  } catch {
    report.checks.funding.status = "unavailable";
    report.checks.funding.message = "Private balances could not be verified. Diagnose access or scanner availability before moving more funds.";
    report.nextAction = "restore_balance_access";
  }
  return report;
}
