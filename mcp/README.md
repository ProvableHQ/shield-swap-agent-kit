# Shield Swap MCP

Draft TypeScript MCP server for terminal users, backed by the published Veil 0.16.1 packages. Wallet configuration happens in a trusted terminal; MCP exposes structured trading tools. The server is a draft; validation coverage and remaining limits are recorded below.

## Run from this repository

Requires Node.js 22.13 or newer and pnpm 10.33.2.

```sh
cd mcp
pnpm install --frozen-lockfile
pnpm run build
node dist/cli.js --help
```

The package is private and unpublished. To install the build elsewhere, run `pnpm pack` here, then `pnpm add /absolute/path/to/provablehq-shield-swap-mcp-0.1.0.tgz` in the consuming project. The installed command is `shield-swap-mcp`.

pnpm is used because Privy 0.35.0 declares an optional Solana Kit 5 peer while the bridge SDK uses Kit 8. The SDK documents this combination: its Privy adapter uses the wire-transaction API, and Kit 8 validates the signed wire. Installation reports that peer warning and warnings from unused Dynamic WalletConnect dependencies. Hosted provider packages are optional; `pnpm add --no-optional /absolute/path/to/the-built-package.tgz` supports local-wallet-only installations from a prebuilt tarball.

## Claude Code launcher

From the complete AgentKit checkout, `npm start` installs dependencies, builds the MCP server, shows the intro, guides protected account setup, and launches Claude with its session MCP connection. See [start with Claude Code](../README.md#start-with-claude-code). Requires macOS/Linux, Node.js 22.13+, and an existing Claude Code login. This helper is for the complete kit; the standalone MCP package still uses the setup and serve commands below.

Passphrases and imported keys are entered in the local terminal before Claude starts. The launcher holds the MCP credentials, checks the selected account's key locally, and preflights the MCP connection without API authentication, balance reads, or transactions. Claude receives only terminal environment settings and a temporary configuration pointing to a stdio proxy. Environment-based Claude/provider authentication is not forwarded; use Claude's existing interactive login.

The proxy connects through a private local Unix socket (directory `0700`, socket and configuration `0600`). A fresh MCP child receives the signing environment on each connection, so reconnecting does not require reentering secrets. Credentials are absent from Claude's environment, arguments and configuration file. This separates credential handoff, but is not a sandbox against programs running as the same OS user. Claude's normal filesystem and tool permissions still apply.

Session files and MCP children are cleaned up when Claude exits. Rerun the launcher to start a new session; it reuses durable account and operation state. No permanent Claude MCP registration is changed. New accounts retain disabled execution permissions. Funding and bounded trading permissions follow the chosen journey. Existing external wallet credentials must already be supplied to the launcher through their configured references; hosted wallet login is not automated here.

## Guided account setup and readiness

The [AgentKit welcome](../context/getting-started.md) presents **Configure an Aleo account for Shield Swap** and **Fund your account**, followed by the selected journey. Connecting trading tools includes both steps; funded profiles are reused.

From the built repository:

```sh
node dist/cli.js setup --guided
```

The installed command is `shield-swap-mcp setup --guided`. It reuses the configured default profile (or `--profile NAME`) without replacing its key or changing permissions. A missing profile offers import or explicit creation in a trusted terminal. New guided profiles default to mainnet; pass `--network testnet` when that is the intended environment. Existing profiles retain their configuration, and a conflicting explicit option is rejected. Non-guided setup still requires `--network`. Hidden prompts and encrypted storage remain the defaults; secrets never pass through MCP.

MCP `setup` is a status action, distinct from terminal account configuration:

```json
{
  "journey": "connect_trading_tools",
  "checkBalances": true
}
```

It returns `schemaVersion: 1`, `checks` for tools/account/funding/execution, observed `completedCheckpoints`, and `nextAction`. This replaces the draft's ambiguous `ready` boolean. With no check options it only inspects local configuration. `checkAccess` verifies signing/API access; `checkBalances` additionally reads holdings. These checks may authenticate and initialize scanner state but never fund, trade or change permissions. Add `profileId` to inspect a non-default profile. A locked store reports `locked` without reading its profiles; failed checks report `unavailable` instead of zero holdings.

Optional `funding: { "tokenId": "DISCOVERED_TOKEN_ID", "amount": "1000000" }` implies balance checking and compares that token's aggregate private balance against the requested integer base-unit amount. Without a target, `available` means some private holdings exist. Neither result guarantees a covering record, fee capacity or readiness for a particular swap. Execution permission is reported separately; existing per-operation caps are unchanged.

Journey IDs are `trade_now`, `connect_trading_tools`, `build_strategy`, and `explore_markets`. `mode: "unattended"` gives the same checks and next action without prompting; the caller provides configuration and authority or handles the missing requirement. Setup does not add cumulative bot budgets, a scheduler, or a persistent onboarding journal.

MCP `setup` includes a `welcome` string containing the shared heading, tagline, status panel and menu. The host agent displays it verbatim for introductory prompts, even after setup; the server never writes a banner directly on protocol stdout. After configuration, [fund the account](../context/shield-swap-setup/bridge-funds.md#agentkit-mcp--use-existing-funds-or-bridge) and continue the selected journey. The Claude launcher handles connection startup after account configuration. For independently configured MCP hosts, restart with the required secret references afterward; setup does not hot-reload a locked process.

## Configure an existing wallet

Provide `SHIELD_SWAP_MCP_PASSWORD` through your secret manager, or let setup prompt for a hidden passphrase. Passphrases must have at least 12 characters.

```sh
node dist/cli.js setup --network mainnet --key-env ALEO_PRIVATE_KEY
```

This derives the address locally and creates a profile with execution disabled. It does not authenticate, fund, or trade. The default profile is `default`; choose another with `--profile NAME`.

By default, `--key-env` stores only the environment variable name. Supply the same key variable when starting MCP. Add `--store-key` to copy that key into encrypted storage instead. Omit `--key-env` to import an existing key through a hidden terminal prompt. `--generate` explicitly creates a new wallet and stores its key encrypted; it never replaces an existing profile.

State defaults to `~/.shield-swap-mcp`; override it with `--state-dir` or `SHIELD_SWAP_MCP_STATE_DIR`. Back up the entire state directory and keep its passphrase separately. Losing either can lose access to stored keys and pending recovery material.

Enable only the intended actions from the trusted terminal. Quote responses identify the exact token ID and base-unit amount used by limits:

```sh
node dist/cli.js configure --profile default --allow-claims
node dist/cli.js configure --profile default --allow-swaps --swap-limit TOKEN_ID=RAW_AMOUNT --max-slippage-bps 100
```

Replace `TOKEN_ID` and `RAW_AMOUNT` with a discovered token ID and the desired integer cap. Limits apply **per operation**, not per day or across a strategy. An absent or zero cap prevents execution for that token. Use `--deny-swaps`, `--deny-claims`, `--deny-bridges`, or `--deny-inventory` to revoke permissions. The MCP configuration tool cannot grant permissions, change signers, or set spending limits. Tools use the configured default profile when `profileId` is omitted; an explicit profile overrides it.

`execute` accepts `count` to submit several swaps of one quote at once; each swap is capped by the token limit, so the count multiplies it. The per-wallet batch cap defaults to 20:

```sh
node dist/cli.js configure --profile default --max-batch-swaps 50
```

Record inventory maintenance (joins and splits) is a separate permission with its own fee ceiling:

```sh
node dist/cli.js configure --profile default --allow-inventory --inventory-fee-limit 5000000
```

The limit is the total network fee in microcredits that one `rebalance_record_inventory` operation may spend; absent or zero prevents execution, and native credits splits deduct 10,000 microcredits each in addition to fees. It also gates `reconcile_record_inventory` with `rebroadcast: true`. Profiles written before this permission existed report `inventory: false`.

## Configure local bridge wallets

Use existing environment keys and explicit RPC endpoints:

```sh
node dist/cli.js configure --profile default --evm-key-env EVM_PRIVATE_KEY --evm-rpc-url https://your-ethereum-rpc.example
node dist/cli.js configure --profile default --solana-key-env SOLANA_PRIVATE_KEY --solana-rpc-url https://your-solana-rpc.example
node dist/cli.js configure --profile default --allow-bridges --bridge-limit ethereum/usdc=2000000
```

EVM accepts a hex private key; Solana accepts a JSON array of 64 keypair bytes. Configuration derives and stores the public address and environment reference locally. It does not broadcast or grant bridge permission unless explicitly requested. Solana routes currently require mainnet; Ethereum testnet uses Sepolia.

Use `list_bridge_routes` → `quote_bridge` → `execute_bridge`. Read progress with `bridge_status`, reconcile checkpoints with `recover_bridge_transactions`, and use `resume_operation` only for the SDK's required next step. Signed EVM/Solana transaction IDs are persisted before the RPC broadcast; Aleo uses the SDK's prepared-transaction checkpoints. A private xReserve mint retains its secret nonce encrypted for recovery. SDK 0.16.0 reads each route's on-chain pause flags: a quote reports `paused` and `routeStatus`, and execution, resumption, or completion of a paused route fails with `route_paused` before any wallet is asked to sign. An execution refused this way is `not_submitted`; a deposited transfer whose completion is refused stays `pending` with the same `nextAction` for a later resume.

## Configure hosted bridge wallets

Privy and Dynamic use the bridge SDK's native EVM and Solana adapters. Configure an existing wallet with a JSON descriptor supplied through an environment variable:

```sh
node dist/cli.js configure --profile default --evm-wallet-env SHIELD_EVM_WALLET
node dist/cli.js configure --profile default --solana-wallet-env SHIELD_SOLANA_WALLET
```

These descriptors contain public wallet identity and **environment variable names**, never credential values. Supply the named credentials to the MCP process through your secret manager. Configuration validates and stores the descriptor locally without creating or funding a wallet; bridge access subsequently authenticates with the provider and checks wallet identity.

Privy descriptor:

```json
{
  "provider": "privy",
  "address": "YOUR_EXISTING_WALLET_ADDRESS",
  "walletId": "YOUR_EXISTING_WALLET_ID",
  "rpcUrl": "https://your-chain-rpc.example",
  "appIdEnv": "PRIVY_APP_ID",
  "appSecretEnv": "PRIVY_APP_SECRET",
  "authorizationKeyEnv": "PRIVY_AUTHORIZATION_PRIVATE_KEY"
}
```

Omit `authorizationKeyEnv` when the wallet ownership policy does not require it. The server checks the wallet ID, chain, and address against Privy's API before constructing its signer.

Dynamic descriptor:

```json
{
  "provider": "dynamic",
  "address": "YOUR_EXISTING_WALLET_ADDRESS",
  "environmentId": "YOUR_DYNAMIC_ENVIRONMENT_ID",
  "rpcUrl": "https://your-chain-rpc.example",
  "apiTokenEnv": "DYNAMIC_API_TOKEN",
  "metadataEnv": "DYNAMIC_WALLET_METADATA",
  "passwordEnv": "DYNAMIC_WALLET_PASSWORD"
}
```

`metadataEnv` names a variable containing the full `walletMetadata` JSON retained at wallet creation/import, including backup pointers. The server compares its identity with the provider before using it. For caller-managed MPC shares, use `keySharesEnv` pointing to a JSON array of shares; omit `passwordEnv` when no backup password is needed. Keep metadata current after resharing or password changes. The server never provisions a replacement wallet.

Dynamic requires its native Node dependencies on a supported platform. Provider packages load only when a configured hosted wallet is used. Solana uses Dynamic network ID `101` and disables sponsorship to preserve bridge signatures. Provider credentials, metadata, and shares are not returned by tools.

## Connect an MCP client

Configure the client to run Node with an absolute path to the built entrypoint:

```json
{
  "mcpServers": {
    "shield-swap": {
      "command": "node",
      "args": ["/absolute/path/to/shield-swap-agent-kit/mcp/dist/cli.js", "serve"]
    }
  }
}
```

Inject `SHIELD_SWAP_MCP_PASSWORD` into the server process using the client's secret management. Profiles that reference environment keys also need those variables. Never paste keys or passphrases into tool arguments or a conversation.

The server uses stdio and does not open a listening port. It can start locked or unconfigured so clients can inspect the tool list and call `setup` for instructions. It never prompts on MCP stdin. SDK console diagnostics are suppressed because they can contain credential-bearing request data; stdout carries MCP messages only.

## Tools

| Workflow | Tools |
| --- | --- |
| Setup and configuration | `setup`, `get_config`, `update_config`, `list_wallets`, `get_wallet_status` |
| Markets and balances | `get_balances`, `list_tokens`, `list_pools` |
| Swaps | `quote`, `execute`, `swap_history`, `claim_unclaimed_swaps` |
| Bridges | `list_bridge_routes`, `quote_bridge`, `execute_bridge`, `bridge_status`, `recover_bridge_transactions` |
| Record inventory | `get_record_inventory`, `plan_record_inventory`, `rebalance_record_inventory`, `reconcile_record_inventory` |
| Maintenance | `maintain_inventory`, `stop_maintenance`, `get_maintenance_status` |
| Durable operations | `get_operation_status`, `list_operations`, `resume_operation` |

`get_balances` includes public AMM tokens, underlying public bridge tokens, and native Aleo fee credits. Its `publicByProgram` breakdown identifies where those balances live; private records remain separate. A total balance does not imply that every operation can spend every balance type.

A quote retains the SDK's executable route, input, minimum output, and expiry, and reports `coveringRecords`, the unreserved records of the input token that each cover the input. `execute` consumes it once and returns an operation ID. `count` submits that many swaps of the quote at once as one operation: a count above `coveringRecords` fails as `insufficient_records` before anything is reserved, each swap keeps its own checkpoint under `swaps`, status aggregates them (uncertain if any item is uncertain, failed if all failed, pending while an output is awaited, otherwise submitted), and a batch of one mirrors its item at the top level. The per-wallet batch cap is `configure --max-batch-swaps`, 20 when unset. Reusing its idempotency key returns the same operation. Poll that operation after a timeout; never create another swap to recover an uncertain submission. Private swap outputs require a subsequent claim.

State is AES-256-GCM encrypted before SQLite writes it. Quotes, profiles, claim material, and bridge checkpoints belong to this local state; tool responses expose selected public fields. Per-account OS locks coordinate processes and profiles sharing Aleo, EVM, or Solana wallets in the same state directory, including history and quote refreshes, and release on process exit. Uncertain operations block new submissions and unrelated resumes across those profiles. SDK history recovery refreshes unresolved identities and expands incomplete scans on later polls.

Local encryption protects data at rest. An unlocked server can use configured signing credentials. The Veil integration uses a remote scanner and delegated prover, whose service boundaries still apply. `configure --fee-master` requests fee sponsorship when the prover has granted that capability; `configure --no-fee-master` restores wallet-funded fees. This setting is also available at setup and is shown by `get_config`. Changing it invalidates earlier quotes, so finish pending operations first.

### Claim failures and recovery

Claims checkpoint preparation separately from entry into the SDK's proving/submission adapter. A failure before that boundary leaves the original claim operation `pending`, with `nextAction: "claim"` and per-item `lastFailure.code: "not_submitted"`. Correct the cause, then explicitly call `resume_operation` with that operation ID. Resume rechecks permissions and claimability and skips claims already completed in the batch.

SDK confirmation timeouts retain their public transaction ID; confirmed rejections also retain the fee transaction ID when supplied. A confirmed claim rejection leaves the claim pending for an explicit resume, with `lastFailure.code: "transaction_rejected"`. A confirmed swap rejection ends that operation as failed; recovery never repeats its deposit. Fees may already have been consumed.

After a lost response or restart, `get_operation_status` reconciles history and checks known transaction IDs for confirmed rejection. An absent transaction, RPC error, or accepted transaction without sufficient claim-history evidence does not authorize another claim. Such claims remain uncertain and block unrelated writes. Older ambiguous checkpoints without submission-boundary evidence or a transaction ID remain conservative; this update does not infer that those transactions failed.

### Record inventory and reservations

The session creates its Veil wallet client with `recordManagement` enabled, using a `RecordInventoryStore` adapter over this package's encrypted state and the chain identity `aleo:<network>`. Every managed write (swap, claim, join, split) reserves its input record nonces atomically under the state file's SQLite write lock before proving, saves the proved transaction before broadcast, and keeps the reservation until the chain outcome is known. Processes sharing the state directory share these reservations; a CLI journal, SDK store, or another state directory does not. The journal holds nonces, statuses, fees, and pending proved transactions, never record plaintext or keys.

`get_record_inventory` resolves the token's underlying record program and reports available and reserved records with base-unit amounts; it reserves nothing. `plan_record_inventory` saves a plan as a durable quote of kind `inventory` (ten-minute lifetime) and returns `planId`, the resolved asset, target, steps, and intrinsic deduction. The default distribution is `floor` (the count is a minimum, met by splitting the largest record, never by joining); `preserve` joins or splits to the exact count and `balanced` makes equal lots. `minRecordAmount` is a human decimal amount converted with the token's decimals. `rebalance_record_inventory` consumes that plan once under the inventory permission and fee limit and returns an operation ID. The SDK rechecks each input before every step, so a plan whose inventory changed stops before proving.

Each proved transaction ID is checkpointed once the SDK has journaled it and before its broadcast; a proof the SDK rejects, such as one over the fee limit, is never recorded as evidence. The wallet client waits up to ten minutes for each managed write to confirm, matching the per-step inventory timeout. A `complete` operation lists `transactionIds` and `completedSteps`. An interruption with no submitted transaction fails as `not_submitted`. An interruption after submission is `uncertain` with `reasonCode` (`confirmation_timeout`, `inventory_changed`, `transaction_rejected`, `fee_limit`, `cancelled`, or `interrupted`); `get_operation_status` reconciles the journal until every listed transaction is confirmed or rejected, then reports `failed` with `nextAction: "plan_again"`. A checkpointed ID the journal never recorded is looked up on chain; because the SDK journals every proof before broadcasting it, an ID absent from both resolves as `not_submitted` rather than blocking the wallet. Accepted joins and splits remain on chain, and `resume_operation` never re-executes a plan.

`reconcile_record_inventory` returns the journal without saved transaction payloads. With `rebroadcast: true` it resends saved proved transactions unchanged, recording `rebroadcastAttempts` and `lastRebroadcastError` per entry; broadcast acceptance is not confirmation. Every reconcile also cancels a local reservation that still has no transaction ID: its writer died before proving while holding the wallet lock, so nothing was broadcast and its inputs are released. Entries with a saved proof stay reserved until rebroadcast or a chain outcome. Swap and claim reconciliation also reconciles the journal so settled inputs are released. The server still runs one operation per wallet at a time; a batch submits its swaps at once inside that one operation.

`maintain_inventory` launches `node dist/cli.js maintain` as a child of the server with the given targets (`token`, `records`, `minRecordAmount`) and interval. Each pass reads the inventory, plans a `floor` target only when fewer unreserved records cover the minimum than the target, runs that plan as an inventory operation under the inventory permission and fee limit, and records the pass in `maintenance:<profile>`: ready counts, action, operation ID, and error. A pass that finds the wallet busy records `operation_pending` and tries again next time. The child exits when the server does; `stop_maintenance` ends it earlier and `get_maintenance_status` reports it. Operators run the same command themselves for a maintainer that outlives the server; `--once` runs one pass. The `floor` target is the planner's default since Veil 0.16.1: it splits the largest record for a shortfall, leaves surplus and sub-minimum records alone, and never joins.

## Current limitations

- Privy/Dynamic EVM/Solana adapters are checked offline. Production provider authentication, wallet policies, and funded hosted-wallet execution have not yet been validated.
- Aleo bridge inputs currently use public balances. Private-record burns are not exposed. Inbound xReserve transfers support public, record, and private mint modes.
- Bridge quotes display SDK fees, which the SDK recalculates before execution; token input caps do not cap network gas fees.
- Bridge recovery requires this server's saved checkpoints. It does not import arbitrary external transactions.
- Inventory maintenance pays public fees or uses FeeMaster; managed private fee selection is not exposed. Rebalances and batches each hold the wallet for their duration.
- Record inventory tools were exercised once on testnet (see below); rebroadcast of a saved inventory transaction has not been exercised live.
- Status reconciliation doubles its history page bound on every incomplete poll. On an account with a long swap history one `get_operation_status` call grew from 11 seconds at 10 pages to 79 seconds at 80 pages, beyond a 60-second MCP client request timeout; configure clients to allow long status calls.
- Queued operations run inside the server process. Closing the MCP transport ends them; a rebalance interrupted before its first proof reconciles to `not_submitted` and its reservations are released on the next reconcile.
- Aleo-to-Ethereum xReserve recovery confirms the source burn, but SDK 0.16.1 does not verify the Ethereum release. Its status remains `DELIVERY_PENDING` with `nextAction: "verify_destination_externally"` and `deliveryVerification: "unsupported_by_sdk"`; inspect destination delivery independently and do not repeat the transfer.
- History discovery probes a bounded identity window and reports incomplete coverage; it cannot promise discovery across arbitrary missing counter gaps.
- Existing Shield Swap CLI file stores and inventory journals do not share this package's encryption, locking, or record reservations. Do not operate the same wallet concurrently through an uncoordinated CLI or another state directory.
- Permission changes are refused while the profile has a queued or running operation.

## Testnet validation

On 2026-11-02, the built stdio server used an existing funded testnet wallet, Veil 0.16.0 and later 0.16.1, and fee sponsorship for these checks through one persistent server process:

| Flow | Evidence |
| --- | --- |
| `plan_record_inventory` for 8 credits records of at least 5 ALEO (`preserve`) | 18 inputs planned as 2 joins and 7 splits; the plan joined every record, including the two that already qualified. |
| `rebalance_record_inventory` | Completed all 9 steps in 113 seconds; the journal lists each transaction with its fee (53,320 and 3,833 microcredits for the joins, 0 for the sponsored splits). Inventory afterwards: 8 records of 668.74 ALEO. |
| Three rebalances interrupted before proving | Reservations left by killed server processes were reported as `cancelled` by the next reconcile and the operations reconciled to `not_submitted`. |
| 0.1 USDCx → ETH swap | Reserved one USDCx record, confirmed with a 939,822 microcredit fee, reported `claimable`. |
| `claim_unclaimed_swaps` | Claimed 50,676,718,961,226 output base units; the claim entry joined the journal with no record inputs. |
| `execute` with `count: 20` against 9 covering records (Veil 0.16.1) | Failed as `insufficient_records` with `covering: 9`, `needed: 20`, and both remedies named; nothing was reserved. |
| `maintain --once` with `USDCx=12:0.1` over 9 covering records (Veil 0.16.1) | The pass planned a `floor` target of three splits and nothing else, ran it as inventory operation `116a7671…` (`at13p4er…`, `at1k6h8e…`, `at1xqq65…`, complete in 41 seconds), and the inventory then held 12 covering records; `get_maintenance_status` reported `action: "rebalanced"` with the operation ID. |
| `execute` with `count: 3` on one 0.1 USDCx → ETH quote (Veil 0.16.1) | Three swaps submitted at once with distinct inputs (`at1xn54f…`, `at1d4hk4…`, `at15vjc9…`), all reported `claimable`; `claim_unclaimed_swaps` then claimed all three in one operation. The status poll that observed them took 165 seconds at 160 history pages. |

The same account ran the kit's Veil and Python concurrent-swap recipes the same day; those results are recorded in [docs/source-map.md](../docs/source-map.md).

## Mainnet validation

On 2026-10-07, the built stdio server used existing local wallets and Veil 0.12.0 for these bounded checks:

| Flow | Evidence |
| --- | --- |
| 0.000002 USDCx → ETH swap | Submitted, claimed, and reconciled after restart. History reports the claim; private balances changed by exactly the input and 382,133,042 output base units. |
| 1 wei ETH, Ethereum → Aleo | SDK destination verification reports complete; the public Aleo ETH balance increased by 1 wei. |
| 2.100001 USDC, Ethereum → Aleo USDCx | Source approval and deposit confirmed; SDK attestation and destination verification report complete. |
| 2.000001 USDCx, Aleo → Ethereum USDC | Source burn confirmed. Independent Ethereum receipt inspection found 0.996501 USDC delivered to the intended wallet; its xReserve withdrawal hook matches the Aleo sender and USDCx token. The SDK status remains `DELIVERY_PENDING` because it lacks this destination verifier. |

The USDC inputs were the smallest pair accepted by the SDK that could cover its quoted inbound and return fees. The return payment exceeded the SDK's conservative quoted output; this test does not establish a fee guarantee. Swap, claim, and the Aleo return burn used delegated fee sponsorship. The ETH bridge additionally paid the SDK-quoted bridge fee and Ethereum gas; provider fees on other routes can reduce the delivered amount. This evidence covers these routes and local accounts; it does not establish hosted-wallet or Solana production behavior. Wallet credentials and recovery state remain outside the repository.

## Development and verification

Run `pnpm test`, `pnpm run typecheck`, and `pnpm run build`. Tests cover SDK quote retention, encrypted persistence, idempotency, delayed confirmations, submission uncertainty, concurrent recovery, OS lock release after a crash, terminal key import, provider identity matching, hosted EVM/Solana signing, paused bridge routes, and stdio restart. Batch tests cover the covering-record count and shortfall refusal, concurrent items with per-item outcomes, identity attribution under interleaved saves, legacy single-swap checkpoints, per-item reconciliation, and the batch cap. Maintainer tests cover target parsing, an idle pass, a shortfall pass through a floor plan, a pass skipped for a busy wallet, the alive-pid guard, and the launcher tools. Inventory tests cover atomic reservations across two state handles, the SDK's release rules for rejected and cancelled entries, durable plans with bigint round trips, permission and fee-limit gating, prepared-transaction evidence after an interruption, evidence withheld for a proof the SDK rejects, reconciliation to `plan_again`, chain lookup of an unjournaled ID, release of reservations orphaned before proving, and plaintext-free reads. Onboarding tests cover missing/locked/configured accounts, guided profile reuse, public-only and insufficient private holdings, and scanner failures. They use temporary test wallets without submitting transactions. Launcher tests use a local stand-in for Claude to check intro loading, account reuse, credential isolation, two MCP connections, cleanup, and failed unlocks. These checks do not establish that a real model reproduces the intro verbatim.

After installing the tarball into an independent project, run:

```sh
node scripts/smoke-installed.mjs /absolute/path/to/independent-project
node scripts/smoke-installed-recovery.mjs /absolute/path/to/independent-project
```

The recovery smoke requires Node 22.15 or newer for module hooks. It runs the installed CLI over MCP with simulated SDK outcomes, checking preparation failure, partial batches, uncertain submission, confirmed rejection, and explicit resume across three process restarts. It uses disposable test wallets and makes no network calls or transactions.

This checks the installed SDK/WASM files, local key import, encrypted state, guided profile reuse, structured readiness, all 27 tool schemas over stdio, and restart. No real wallet material belongs in this repository.
