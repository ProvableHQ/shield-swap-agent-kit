# Terminal (terminal.pump.fun)

Status: integration evaluation guidance; no Terminal connector or verified Terminal account-control API is supplied by this kit. Sources checked 2026-10-01.

Keep the named [Terminal product](https://terminal.pump.fun/) distinct from the Pump/PumpSwap on-chain protocols. Pump's [official public documentation](https://github.com/pump-fun/pump-public-docs) publishes protocol instructions, IDLs, and SDK references. That is evidence for a protocol integration, not authority to operate a user's Terminal session.

## Choose what is being integrated

- **Use Terminal alongside Shield Swap:** retain the terminal-side operation independently and execute only the explicitly requested Aleo leg.
- **Read Pump/PumpSwap market state:** use a verified protocol SDK or documented data provider, recording the exact program, mint, quote asset, and observation time.
- **Add Shield Swap inside Terminal:** obtain the product's supported API/extension or partner integration requirements first. No endpoint or authentication scheme is assumed here.

A third-party service with "pump" in its name is not automatically an official Terminal API. Do not send account credentials to an endpoint based on branding or search results.

## Asset and lifecycle boundaries

Resolve the token's source-chain mint and its actual Shield Swap representation. A newly launched token, bonding-curve trade, or migrated pool is not automatically supported on Aleo. Verify listing and funding/bridge support before offering an execution path.

Protocol pool state and pricing can change with program revisions. Use the selected official SDK's quote logic rather than assuming a token chart or raw vault balance provides an executable price.

A connector must correlate the source trade with the Shield Swap swap and claim, deduplicate external triggers, and account for unmatched inventory. There is no atomicity across these products merely because an agent controls both.

Continue with [terminal integration](../decisions/trade/terminal-integration.md) and [funding](../shield-swap-setup/bridge-funds.md).
