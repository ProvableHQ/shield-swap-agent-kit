# Source map

Rechecked on 2026-10-01 for the cross-surface context and operational documentation. These are local checkout observations, not published-version or live-network verification. The sources below inform the kit; their existing runbooks are not copied wholesale.

## Sources

| Source | Inspected revision / package version | Reuse |
| --- | --- | --- |
| [Veil Shield Swap SDK](https://github.com/ProvableHQ/veil/tree/main/packages/shield-swap) | `044fdcdede0adc53ef4d49836707bbbf9f12cd82`; SDK `0.11.1` | `skills/` runbooks, quote/swap/claim methods, identity persistence, `/agent` schemas and handlers, `/mcp` dispatcher. |
| [Shield Swap CLI](https://github.com/ProvableHQ/veil/tree/main/packages/shield-swap-cli) | Same Veil revision; CLI `0.11.1` | Account configuration, network-scoped session state, command registry, JSON output, and transaction planning. |
| [Python Shield Swap SDK](https://github.com/ProvableHQ/python-sdk/tree/master/shield-swap-sdk) | `dba135bec7f88585952e16ee39a5e765f30f50de`; SDK `0.6.0` | Profile/journal lifecycle, authentication, balance and faucet checks, native quote/swap/claim methods. The MCP observations below came from the earlier `0.5.1` inspection at `1152925d6aea1ef3f529df2716005d7b3bc0ae56`. |
| [Shield Swap documentation source](https://github.com/ProvableHQ/shield-swap-documentation) | No release compatibility claim | Canonical product and protocol reference; publish AgentKit discovery and installation instructions there. |

Use the installed dependency's reference when writing executable code. The Python package prints its bundled guide with `python -m aleo_shield_swap`; TypeScript ships its SDK README and skill runbooks. The kit does not assert that all capabilities are available through every SDK or MCP surface.

## Material that can inform the kit

| Kit concern | Existing files / interfaces |
| --- | --- |
| Build versus trade | Veil `packages/shield-swap/skills/developing.md`; Python `shield-swap-sdk/AGENTS.md`, development-guide section. Move this choice before onboarding. |
| Account and session setup | CLI `src/session.ts` and `src/commands/setup.ts`; Python `python/aleo_shield_swap/profile.py` and `client.py`. |
| Quote and execution | Both `examples/first-swap/` directories. TS: `client.quote()`, `client.swap({ quote })`, `client.claimSwapOutput()`. Python: `dex.quote()`, `dex.swap(quote).delegate(...)`, `dex.claim_swap_output(...).delegate(...)`. |
| Recovery | CLI `src/commands/swap-history.ts`, SDK identity store and reconciliation methods; Python journal and `collect_all()`. |
| Agent tools | TS `src/agent/`; Python `python/aleo_shield_swap/agent.py`. Reuse exported definitions rather than maintaining a second schema catalog. |
| MCP | TS `src/mcp/index.ts` plus Veil `packages/core/src/mcp/index.ts`; Python `python/aleo_shield_swap/mcp.py`. Their transport and tool coverage differ. |

## Corrections to preserve when reusing flows

| Finding | Required treatment |
| --- | --- |
| TS setup and runbooks retain invite-code assumptions. | Current product behavior is authentication-based access with optional referrals. Remove obsolete gates in the owning SDK/CLI and depend on a verified release; never ask a user for an invite code to work around old guidance. |
| Some docs still describe default Provable consumer registration. | Default proving/scanning uses `https://edge.provable.com/api` without consumer registration. Legacy endpoints can have different credentials. DEX authentication remains separate. |
| Python `from_profile()` creates/loads key material and attempts scanner setup before `status()`. | Establish intent, custody, account, and profile location before constructing a profile-bound client. Do not use it to discover whether a user has an account. |
| Python first-swap example defaults `ENABLE_JOURNAL` to false. | Enable durable journaling before adopting this as an operational example. A handle held only in memory is not a recovery workflow. |
| TS runbooks mix legacy state paths and counter-allocation guidance with newer store behavior. | Follow the configured network-scoped session and current persistent identity store. Record contention is a separate concurrency concern. |
| TS `/mcp` returns `{ tools, handleToolCall }`. | It is a dispatcher, not a launchable server. A standalone server still needs transport, configuration, input validation, and protocol tests. |
| Python MCP falls back to a signing profile when `ALEO_PRIVATE_KEY` is absent. | Omitting a key does not make it read-only. Its profile fallback also does not forward the initially read network/endpoint into `from_profile()`. Verify the chosen profile before launch. |
| TS `includeWrites: false` excludes money-moving tools but can still expose authentication/token mutations. | A read-only server must select actual read tools; the flag alone is not a complete permission boundary. |
| MCP coverage differs from SDK coverage. | Python's inspected tool catalog lacks standalone quote/single-swap/individual-claim tools; TS needs further operational recovery tooling. Describe supported tools from the actual catalog. |
| Quote and manual-transaction amount conventions differ. | Quote examples use human decimal strings; manual transaction amounts and returned handles use base units. Preserve the quote object and its minimum output. |
| CLI `swap` checks private holdings before its plan-only branch. | An unfunded quote-only task uses the SDK, not an unsolicited faucet request. Use the CLI session export to preserve account and state. |
| CLI `pools --token` filters after fetching a bounded pool list; Python `get_pools()` exposes no pagination arguments. | An empty filtered response does not prove that no matching pool exists. Use explicit API pagination where supported and report the inspected scope. |
| CLI `swap --execute` obtains a new quote. | Do not describe plan/execute as consuming one retained quote. Exact quote approval needs the SDK path; execution under preauthorized bounds must remain within those bounds. |
| Veil quotes carry a 60-second preparation expiry; Python's inspected quote has no expiry field. | Describe each SDK's actual freshness behavior. Python's transaction deadline is not a quote-freshness guarantee. |
| Python `status()` can degrade to public-only holdings if private scanning fails. | Use `get_balances()` for funding verification so scanner errors are visible. |
| Python `pending_claims()` omits journal entries without a swap ID. | An empty pending list does not establish that an unknown broadcast failed. Recover the original transaction before retrying. |
| Veil reconciliation comments understate request recovery. | The implementation matches accepted single- and multi-hop requests to known identities and can reconstruct handles using surviving blinding material. Search bounds, missing transaction bodies, and previously searched/handled records limit coverage; `complete` is not a universal recovery guarantee. |
| Veil `syncBlindedIdentities()` infers claimed status from missing output. | Do not treat this local status alone as proof of an accepted claim; correlate the actual transaction. |
| Veil `transactionStatus()` catches read errors and can return `not_found`. | Use direct confirmed-transaction reads for recovery and preserve transport uncertainty. |
| Python API swap history/detail endpoints are retired. | Use the journal plus on-chain execution receipts. Pool trade feeds describe market activity, not the account's private ledger. |
| Neither inspected SDK exports a general split/join/autojoin helper. | Explain single-record readiness and coordination. Any record reshaping requires the actual token program's supported ABI and a separately authorized transaction. |
| Counter locking is not account-wide record reservation. | Veil's store lock is process-local; Python batch exclusions are batch-local. Coordinate input records across writers or serialize them. |
| Veil has no public record-provider progress API; Python's Shield facade has no public scanner-status accessor. | Do not invent scanner heights or use private members in portable recipes. Distinguish DEX indexer freshness from record visibility. |
| Wallet-based Veil claims can return before chain confirmation. | Verify confirmation separately; neither local nor wallet claim return implies records are already scanner-visible. |

## Standalone MCP implementation evidence

On 2026-10-07, the draft in `mcp/` was checked against published `@provablehq/veil-core`, `@provablehq/veil-aleo-sdk`, `@provablehq/shield-swap-sdk`, `@provablehq/aleo-bridge-sdk`, and `@provablehq/sdk` version **0.12.0**, pinned in its lockfile. This is separate from the older checkout observations above.

Fifty-three offline MCP tests, TypeScript checking, and the build pass. A tarball installed in a fresh project outside SDK workspaces passes SDK key import, encrypted persistence, all twenty tool schemas over stdio, and two process restarts. A separate crash test verifies that the operating system releases the wallet lock. That packaging evidence is offline. Separate mainnet stdio checks completed a local USDCx-to-ETH swap and claim, verified its private balance changes and history after restart, and completed Ethereum-to-Aleo ETH delivery with an exact destination balance increase. USDC inbound destination verification completed, followed by an accepted Aleo return burn and an independently inspected Ethereum payment whose withdrawal hook matches the Aleo sender and token. The SDK cannot verify that outbound release itself; the MCP reports external verification as the next action. See the [MCP validation table](../mcp/README.md#mainnet-validation).

Recovery regressions exercise the installed Shield Swap SDK's negative history cache and pagination. Unresolved identities must be searched again after an empty scan, and incomplete scans need expanding coverage. A proving-adapter checkpoint distinguishes failures before submission from ambiguous results; a swap deposit is never replayed by recovery.

Bridge regressions exercise the native SDK checkpoint format, Aleo prepared-transaction recovery, private mint destination transitions, and lost first approval/deposit responses. The owned EVM/Solana RPC transport persists signed transaction IDs before broadcasting; private mint checkpoints preserve the exact SDK hook data. No protocol or signing logic is reimplemented.

Hosted-wallet checks use Privy 0.35.0 and Dynamic 1.1.24 with the bridge SDK's native adapters. Tests validate provider wallet identity and Dynamic creation metadata, and exercise all four hosted EVM/Solana signing paths with local signatures and mocked RPC broadcasts. pnpm retains the SDK-documented Privy/Kit peer mismatch; this is offline integration evidence, not proof of production authorization or balances.

## External integration evidence

The integration pages cite official product documentation checked on 2026-10-01: Axiom product/limit-order guides, GMGN's official agent package and separate legacy routing API, Pump's protocol documentation, BONKbot/Telemetry guides, Banana Gun product/scraper guides, and fomo's site.

GMGN has a documented agent interface; that does not supply an Aleo connector. For the other named products, the reviewed material did not verify a general product-account execution API. Protocol SDKs, human trading interfaces, and Telegram-client credentials are not substitutes for that evidence. Each guide separates sourced product facts from proposed connector requirements.

## Evidence boundary

Repository tests validate context structure and isolated packaging. The operational recipes are checked against the source interfaces above; source inspection does not certify published dependency versions, live onboarding, a completed swap, or transport compatibility. Report syntax/type checks separately from live workflow tests.

For this documentation pass, the examples were extracted and checked without executing trading code: 42 TypeScript modules typechecked against local SDK declarations (native SDK and CLI-session variants), 19 Python blocks parsed, and 26 shell blocks passed syntax checks. All 37 context pages were reachable from `AGENTS.md`, and the operational directory matched the revised ten-file layout. The existing `swap.md` prose and examples were preserved, with only renamed link targets updated. These checks do not validate private scanner behavior, live transaction outcomes, or external connector access.
