# Source map

Rechecked on 2026-10-01 for the CLI-first context iteration. These are local checkout observations, not published-version or live-network verification. The sources below inform the kit; their existing runbooks are not copied wholesale.

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
| CLI `swap --execute` obtains a new quote. | Do not describe plan/execute as consuming one retained quote. Exact quote approval needs the SDK path; execution under preauthorized bounds must remain within those bounds. |
| Veil quotes carry a 60-second preparation expiry; Python's inspected quote has no expiry field. | Describe each SDK's actual freshness behavior. Python's transaction deadline is not a quote-freshness guarantee. |
| Python `status()` can degrade to public-only holdings if private scanning fails. | Use `get_balances()` for funding verification so scanner errors are visible. |
| Python `pending_claims()` omits journal entries without a swap ID. | An empty pending list does not establish that an unknown broadcast failed. Recover the original transaction before retrying. |

## Evidence boundary

Repository tests validate context structure and isolated packaging. The operational recipes are checked against the source interfaces above; source inspection does not certify published dependency versions, live onboarding, a completed swap, or transport compatibility. Report syntax/type checks separately from live workflow tests.
