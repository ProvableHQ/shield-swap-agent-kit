# Source map

Rechecked on 2026-10-01 for the cross-surface context and operational documentation. These are local checkout observations, not published-version or live-network verification. The sources below inform the kit; their existing runbooks are not copied wholesale.

## Sources

### Trading integration and arbitrage

The [trading integration](../skills/trading-integration/SKILL.md) and [arbitrage](../skills/arbitrage/SKILL.md) skills were checked on 2026-11-24 against published packages installed outside the SDK workspaces: PyPI `aleo-sdk` and `shield-swap-sdk` `0.8.0`, Web3 `8.0.0`, and npm `@provablehq/shield-swap-sdk`, `@provablehq/veil-core`, and `@provablehq/veil-aleo-sdk` `0.16.2`. Consumer installation instructions use the latest release, rather than pinning this validation snapshot.

The Python modules use native quotes and handles, `Journal`, and `SqliteRecordInventoryStore`. The JavaScript modules implement Veil's public `RecordInventoryStore` contract with SQLite and retain `swapFileStore` for identities. Both add application request IDs and durable submit/claim checkpoints. Published record management supplies reservations and inventory planning; the older concurrency observations below predate those interfaces. [AgentKit PR #13](https://github.com/ProvableHQ/shield-swap-agent-kit/pull/13) informed the concurrent-request scenarios, without restoring the removed MCP server.

The expanded standalone references were checked against those same published packages on 2026-11-24. They cover raw registry `address` versus database `id`, quote units and expiry, underlying record programs, exact-plan inventory execution, delegated proving and fee sponsorship, SDK journal inspection, and application checkpoint correlation. The browser example uses the native wallet path with algorithm grants, record input requests, Web Locks, browser persistence, and separate request/claim confirmation. Its mocked transactions follow the installed core program ABI, including nested router calls for wrapped and multi-hop routes. An opaque wallet response lost before its request ID is known remains unresolved; the example does not invent recovery identifiers.

Browser tests use actual published SDK actions with mocked API, wallet, chain, storage, and lock interfaces. They cover refresh, duplicate requests, missing responses, account changes, pending confirmation, and storage failure before and after dispatch. Native Node and browser tests run from copied consumer projects when `TRADING_TEST_NODE_MODULES` is supplied. Browser storage in a real browser, deployed wallet permissions, CORS, and funded browser execution remain unverified.

Independent agents used isolated standalone copies to build a Python worker, a concurrent TypeScript service, and browser event handlers. Each produced callable code and passed its own offline tests and applicable native typechecks. Their package research was limited to public signatures/types and test fixtures; earlier baseline runs needed implementation research for inventory and wallet mechanics now supplied by the skill. These exercises validate the sampled build tasks, not every autonomous strategy or wallet provider.

The maintained arbitrage implementation is Python and uses a configured Uniswap v3 pool. Its ABI follows the official [original SwapRouter](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/ISwapRouter.sol) and [QuoterV2](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/IQuoterV2.sol); addresses must match the chosen chain's [deployments](https://developers.uniswap.org/docs/protocols/v3/deployments). It sells on Shield Swap, waits for the claim, then buys the same base quantity on Uniswap. It does not execute both venues atomically or bridge inventory inside the cycle. TypeScript has maintained core trading modules and a strategy adaptation guide, not a second validated arbitrage implementation.

Copied-consumer tests exercise native quote shapes, real Web3 ABI encoding and signing against a controlled RPC, concurrent requests, duplicate IDs, process restart, unknown submissions/claims, partial fills, signer changes, gas preflight, and Python/JavaScript reservation interoperability. TypeScript checks use the installed package declarations. Live inspection authenticated existing Aleo accounts, registered scanners, read private balances on both Aleo networks, read EVM balances on Ethereum/Base/Arbitrum, and obtained Shield and Ethereum Uniswap quotes. The sampled mainnet opportunity was unprofitable before fees; no mainnet arbitrage transaction was submitted.

The copied Python trading modules also submitted two independent testnet swaps concurrently, using existing ETH and USDCx records. A fresh process resumed and confirmed both claims: `0.0001` testnet ETH returned `0.197188` USDCx, and `0.2` testnet USDCx returned `0.000112282234744379` ETH. Both input refunds were zero. SDK journals and operation state were retained privately outside the deliverable. This validates the Python submit/restart/claim path; it does not establish a profitable two-venue cycle or funded TypeScript execution. No mainnet funds were spent.

### Opening account and tool inventory

The [local setup inspector](../tools/inspect-setup.mjs) uses the public shared-account APIs described below, the funding skill's version 1 wallet manifests, and installed package metadata. Its tests cover all three account families, version/location reporting, missing or incompatible tools, custom locations, and a copy run outside the kit. A native smoke check on 2026-11-24 used an isolated home with an address-only account, installed Veil packages `0.16.2`, Python packages `0.8.0`, and the installed Shield Swap CLI `0.16.2`. The older SDKs lacked metadata readers, so the CLI supplied the public account description. No signing key, keychain entry, scanner, or chain was accessed. Host wallet/MCP readiness remains a separate current check by the calling agent.

### Shared account setup

The [Aleo account setup skill](../skills/aleo-account-setup/SKILL.md) and account connection recipes were checked against Veil `main` at [`f59affa8`](https://github.com/ProvableHQ/veil/commit/f59affa8ce4a13e58ecb357e06ad4d449af02d38) and Python SDK source at [`156df8e7`](https://github.com/ProvableHQ/python-sdk/commit/156df8e78689c05af9c4ddffbcca23e253dde8cb) on 2026-11-17. Those are source-validation records, not Python installation instructions. Python setup installs the latest `aleo-sdk` and `shield-swap-sdk` releases from PyPI and checks the installed account interfaces. Veil setup uses `main`.

Account behavior comes from Veil's `packages/provable-sdk/src/keystore/`, `packages/shield-swap-cli/src/commands/account.ts`, and `site/docs/api/provable-sdk/accountKeystore.md`; Python's `sdk/python/aleo/keystore/` and `shield-swap-sdk/python/aleo_shield_swap/profile.py`. Both source implementations use the version 1 account schema in `~/.aleo/accounts`. Account files are shared; trading state and recovery stores are separate. The PyPI macOS wheel inspected on 2026-11-19 contains both native network extensions. At that check, both published SDKs were `0.8.0`, which lacks the shared-keystore and account-aware profile interfaces used by these recipes. The setup capability check reports that gap without substituting a source build.

The standalone skill also bundles public balance inspection and basic application setup. Its balance helper reads each network's public `/tokens` registry and the underlying and wrapper programs' address-keyed `balances` mappings. On 2026-11-19, read-only checks against both live registries and deployed programs verified these shapes; BAT, ZEC, and USDG were absent from the testnet registry and are reported as not listed. The helper keeps failed reads distinct from zero. Veil's `createRemoteScanner({ waitForSync: true })` and Python's `records.register()`/`records.status()` supply registration and synchronization; both helpers use native API challenge authentication and durable recovery stores without calling funding helpers. Their source behavior was checked at the revisions above. Basic setup ends with trading/funding choices; bridging and airdrop execution are outside the standalone skill.

### Standalone funding

The native Python funding path was checked against the latest PyPI `aleo-bridge-sdk` `0.8.0` and `aleo-sdk` `0.8.0` in an isolated Python environment on 2026-11-21. That release supplies EVM/Solana connections, Privy/Dynamic signers, Arc/CCTP routes, and file checkpoints. Python SDK `master` at `7012871f146dfaf70d8648172c418a1da787220c` also includes the automatic live pause guards introduced in [PR #86](https://github.com/ProvableHQ/python-sdk/pull/86); those guards and `Bridge.pause_status` are absent from PyPI `0.8.0`. The skill uses the installed lifecycle without requiring that separate method or changing languages.

The Python wallet helper passed seven storage/recovery tests using a mock credential store. An installed-copy smoke check exercised native EVM/Solana generation, SDK connections, reload, and reuse of the EVM identity on Arc with `eth-account` `0.14.0`, `solders` `0.29.0`, and `keyring` `25.7.0`. All Python connection examples imported in that environment. OS credential access was mocked and network connections disabled; no hosted wallet was provisioned and no funded transfer was tested.

The [funding skill](../skills/aleo-funding/SKILL.md) was checked on 2026-11-20 against Veil `main` at [`2acc0855`](https://github.com/ProvableHQ/veil/commit/2acc08553487dcfbe0ea902ff9919789b9286384), including `packages/bridge/src/registry/default.ts`, wallet adapters, checkpoint recovery, and the Arc/CCTP examples. Its source balance helper also ran against the installed bridge package `0.16.2` outside the SDK workspace. Live read-only checks verified the four configured EVM networks and their registered token balances. The helper checks bridge assets and native gas, not an exhaustive wallet portfolio. Arc USDC is one balance exposed through two decimal interfaces; it is counted once.

Local signer generation and reload were exercised with the real bridge SDK, viem `2.58.2`, and Solana Kit `8.6.0`, using a mocked credential backend. `@napi-rs/keyring` `2.1.2` supplies persistent OS storage; its Linux backend must explicitly select Secret Service. Privy `0.35.0` adapter construction and API shapes were checked without provider authentication. Privy's optional Kit 5 peer conflicts with the bridge's Kit 8 peer under npm; the documented scoped override was installed successfully. Wallet interruption, unknown submission, restart, concurrent submission, and source-to-destination recovery behavior have local tests. OS credential writes, hosted-wallet provisioning, and funded bridge transactions were not exercised for this skill.

Provider setup follows [Privy's wallet creation API](https://docs.privy.io/wallets/wallets/create/create-a-wallet) and [Dynamic's server-wallet storage guidance](https://www.dynamic.xyz/docs/node/wallets/server-wallets/storage-best-practices). Arc network details were verified against [Arc's connection reference](https://docs.arc.io/arc/references/connect-to-arc), and the testnet faucet against the [Aleo faucet listing](https://aleo.org/ecosystems/aleo-faucet/). Registry availability is still followed by live route, pause, fee, and signing checks when funding is requested.

### Trading interfaces

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
| Older SDKs lacked the current inventory planners and join/split helpers. | Use the installed SDK's record-management interface. Record reshaping is a separate authorized transaction; do not infer readiness from aggregate balance. |
| Counter locking alone is not account-wide record reservation. | Enable record management with a durable reservation store shared by every writer. The trading skill supplies tested single-host storage; unrelated processes or separate stores do not coordinate. |
| Veil has no public record-provider progress API; Python's Shield facade has no public scanner-status accessor. | Do not invent scanner heights or use private members in portable recipes. Distinguish DEX indexer freshness from record visibility. |
| Wallet-based Veil claims can return before chain confirmation. | Verify confirmation separately; neither local nor wallet claim return implies records are already scanner-visible. |

## External integration evidence

The integration pages cite official product documentation checked on 2026-10-01: Axiom product/limit-order guides, GMGN's official agent package and separate legacy routing API, Pump's protocol documentation, BONKbot/Telemetry guides, Banana Gun product/scraper guides, and fomo's site.

GMGN has a documented agent interface; that does not supply an Aleo connector. For the other named products, the reviewed material did not verify a general product-account execution API. Protocol SDKs, human trading interfaces, and Telegram-client credentials are not substitutes for that evidence. Each guide separates sourced product facts from proposed connector requirements.

## Evidence boundary

Repository tests validate context structure, isolated packaging, and the bundled workflow modules. The dated sections above distinguish published-package checks and live observations from older source inspections. Source inspection alone does not certify live onboarding, a completed swap, or transport compatibility. Report syntax/type checks separately from live workflow tests.

For this documentation pass, the examples were extracted and checked without executing trading code: 42 TypeScript modules typechecked against local SDK declarations (native SDK and CLI-session variants), 19 Python blocks parsed, and 26 shell blocks passed syntax checks. All 37 context pages were reachable from `AGENTS.md`, and the operational directory matched the revised ten-file layout. The existing `swap.md` prose and examples were preserved, with only renamed link targets updated. These checks do not validate private scanner behavior, live transaction outcomes, or external connector access.
