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

Enable only the intended actions through [client confirmation](#approve-execution-access) or the trusted terminal. Quote responses identify the exact token ID and base-unit amount used by limits:

```sh
node dist/cli.js configure --profile default --allow-claims
node dist/cli.js configure --profile default --allow-swaps --swap-limit TOKEN_ID=RAW_AMOUNT --max-slippage-bps 100
```

Replace `TOKEN_ID` and `RAW_AMOUNT` with a discovered token ID and the desired integer cap. Limits apply **per operation**, not per day or across a strategy. An absent or zero cap prevents execution for that token. Use `--deny-swaps`, `--deny-claims`, `--deny-bridges`, or `--deny-inventory` to revoke permissions. `update_config` cannot grant permissions, change signers, or set spending limits; `request_permissions` proposes policy changes for explicit client approval. Tools use the configured default profile when `profileId` is omitted; an explicit profile overrides it.

Record inventory maintenance (joins and splits) requires a separate permission:

```sh
node dist/cli.js configure --profile default --allow-inventory
```

This permission also gates `recover_record_inventory` with `rebroadcast: true`. Inventory execution has no separate fee limit. Native credits splits deduct 10,000 microcredits each in addition to network fees. Profiles written before this permission existed report `inventory: false`.

## Approve execution access

For an existing profile, `setup` reports its policy and access guidance under `checks.execution`; `get_config` reads the saved permissions. All four execution flags remain disabled for new profiles. Reads, quotes, and inventory plans require no grant. The [setup flow](../context/shield-swap-setup/configure-shield-swap.md#agentkit-mcp) guides access when the selected task needs it.

`request_permissions` is an additive tool for proposing a persistent policy change. For example, an authorized swap flow may need swaps, claims, an input-token cap, and maximum slippage:

```json
{"name":"request_permissions","arguments":{"profileId":"SELECTED_PROFILE","permissions":{"swaps":true,"claims":true},"swapLimits":[{"token":"DISCOVERED_INPUT_TOKEN_ID","amount":"1500000"}],"maxSlippageBps":50}}
```

The amount is illustrative, not authorization. Use the exact token ID and base-unit amount from discovery/quotes and the user's chosen cap. For bridges use `permissions: { bridges: true }` with `bridgeLimits: [{ asset: "ethereum/usdc", amount: "2000000" }]`, substituting the actual quoted source asset and authorized cap. For inventory use `permissions: { inventory: true }` only after explaining joins, splits, fees, and ongoing maintenance authority. Supply only changed fields; omitted permissions and caps are preserved. Caps merge by asset ID, and zero disables that asset. Slippage must be 0–1000 basis points.

The server sends an MCP **form elicitation** request showing the selected account/network, current policy, and proposed policy. A trusted client must show it to the user and return their explicit approval. Ordinary tool arguments cannot confirm it; `approved: true`, keys, and signer changes are rejected. Elicitation relies on the client's honesty about user approval, so do not configure the host to let the model answer these forms. Client-level approval of tool invocation and this persistent server policy are separate controls.

Grants persist for that profile across restarts until revoked. Caps apply **per operation**, not per day or strategy. Claims and inventory have no separate amount or fee cap. Inventory access permits enabled jobs to keep submitting joins/splits and permits recovery rebroadcast; restoring access can allow previously enabled jobs to continue. Permission approval itself submits nothing and starts no job. Review and start the intended maintenance target separately, and use `stop_inventory_maintenance` to disable it.

Results report `approved`, `unchanged`, `declined`, `cancelled`, or `requires_terminal`. Clients without form elicitation receive a shell-quoted `command` for the exact state directory and profile. Have the user review and run it in their trusted terminal; from a repository build, replace `shield-swap-mcp` with `node dist/cli.js`. Keep the passphrase in the terminal or secret manager. The agent must not run this fallback automatically to bypass confirmation.

No locks are held while the form is open. A concurrent profile change invalidates the approval; queued/running/submitted operations also block the update, as they do for terminal configuration. Cancellation, disconnect, malformed approval, and form errors leave the request unapplied. If a response is lost after approval, read `get_config` to determine the saved policy. After approval, recheck quote expiry and any original operation before continuing. No operation is automatically retried.

To revoke through the form, request the relevant flag as `false`, for example `permissions: { inventory: false }`; setting a token cap to `"0"` disables that token. The existing terminal `configure --deny-*` commands still work. For unattended execution, configure access beforehand and return missing requirements to the operator rather than requesting interactive approval. See [permissions](../context/safety/permissions.md#agentkit-mcp-execution-access) for the task-to-access mapping.

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
| Setup and configuration | `setup`, `get_config`, `update_config`, `request_permissions`, `list_wallets`, `get_wallet_status` |
| Markets and balances | `get_balances`, `list_tokens`, `list_pools` |
| Swaps | `quote`, `execute`, `swap_history`, `claim_unclaimed_swaps` |
| Bridges | `list_bridge_routes`, `quote_bridge`, `execute_bridge`, `bridge_status`, `recover_bridge_transactions` |
| Maintenance | `start_inventory_maintenance`, `stop_inventory_maintenance`, `get_inventory_maintenance_status` |
| Record inventory | `get_record_inventory`, `plan_record_inventory`, `rebalance_record_inventory`, `recover_record_inventory` |
| Durable operations | `get_operation_status`, `list_operations`, `resume_operation` |

`get_balances` includes public AMM tokens, underlying public bridge tokens, and native Aleo fee credits. Its `publicByProgram` breakdown identifies where those balances live; private records remain separate. A total balance does not imply that every operation can spend every balance type.

A quote retains the SDK's executable route, input, minimum output, and expiry. `execute` consumes it once and returns an operation ID. Reusing its idempotency key returns the same operation. Poll that operation after a timeout; never create another swap to recover an uncertain submission. Private swap outputs require a subsequent claim.

State is AES-256-GCM encrypted before SQLite writes it. Quotes, profiles, claim material, and bridge checkpoints belong to this local state; tool responses expose selected public fields. OS locks coordinate operation ownership, shared identity updates and conservative legacy/bridge account exclusion across processes. Managed uncertainty holds its own resources while unrelated trades can proceed. Locks release on process exit. SDK history recovery refreshes unresolved identities and expands incomplete scans on later polls.

Local encryption protects data at rest. An unlocked server can use configured signing credentials. The Veil integration uses a remote scanner and delegated prover, whose service boundaries still apply. FeeMaster sponsorship is enabled by default for new profiles and profiles without an explicit setting. Sponsorship requires prover support. `configure --no-fee-master` selects wallet-funded fees; `configure --fee-master` enables sponsorship again. Explicit existing choices are preserved and `get_config` reports the effective setting. Changing it invalidates earlier quotes, so finish pending operations first.

### Claim failures and recovery

Claims checkpoint preparation separately from entry into the SDK's proving/submission adapter. A failure before that boundary leaves the original claim operation `pending`, with `nextAction: "claim"` and per-item `lastFailure.code: "not_submitted"`. Correct the cause, then explicitly call `resume_operation` with that operation ID. Resume rechecks permissions and claimability and skips claims already completed in the batch.

SDK confirmation timeouts retain their public transaction ID; confirmed rejections also retain the fee transaction ID when supplied. A confirmed claim rejection leaves the claim pending for an explicit resume, with `lastFailure.code: "transaction_rejected"`. A confirmed swap rejection ends that operation as failed; recovery never repeats its deposit. Fees may already have been consumed.

After a lost response or restart, `get_operation_status` reconciles history and checks known transaction IDs for confirmed rejection. An absent transaction, RPC error, or accepted transaction without sufficient claim-history evidence does not authorize another claim. Such claims remain uncertain and retain ownership of their selected outputs. A cancelled local reservation with no prepared transaction can restore the original claim to a safely resumable state. Older ambiguous checkpoints without submission-boundary evidence or a transaction ID remain conservative; this update does not infer that those transactions failed.

Managed local swaps also recover expired execution inputs automatically. Recovery holds the operation lock, so an active writer blocks release. It reads the deadline from the saved proved swap's finalize arguments, verifies the deployed program enforces it, then checks execution-input serial numbers directly against the configured chain endpoint. The chain must be strictly beyond the deadline before those checks and must not regress afterward. These reads bypass caches and require the node's explicit missing-transition response; scanner snapshots, generic HTTP 404 responses and the quote's wall-clock expiry do not authorize release. Missing proofs, unsupported program shapes, spent inputs, stale heights and failed reads keep reservations held.

When expiry is established, the journal atomically records the evidence, releases the execution inputs, disables rebroadcast of that attempt and wakes maintenance. The operation reports `error.code: "swap_expired"` and `inputRecordsReleased: true`; a new trade requires a new quote. A private fee record remains reserved while its outcome is unresolved (`status: "uncertain", feePending: true`), even though the execution inputs are reusable. Once the fee outcome is known, the operation becomes `failed`; a consumed fee stays excluded. With no private fee reservation, the expired operation becomes `failed` immediately. Claims, bridges, inventory joins/splits and opaque wallet submissions do not use this swap-specific expiry rule. `recover_record_inventory` exposes the persisted `expiryRelease` evidence and will not rebroadcast a released attempt.

### Record inventory and reservations

The session creates its Veil wallet client with `recordManagement` enabled, using a `RecordInventoryStore` adapter over this package's encrypted state and the chain identity `aleo:<network>`. Every managed write (swap, claim, join, split) reserves its input record nonces atomically under the state file's SQLite write lock before proving, saves the proved transaction before broadcast, and keeps the reservation until the chain outcome is known. Processes sharing the state directory share these reservations; a CLI journal, SDK store, or another state directory does not. The journal holds nonces, statuses, fees, and pending proved transactions, never record plaintext or keys.

`get_record_inventory` resolves the token's underlying record program and reports available and reserved records with base-unit amounts; it reserves nothing. `plan_record_inventory` saves a plan as a durable quote of kind `inventory` (ten-minute lifetime) and returns `planId`, the resolved asset, target, steps, and intrinsic deduction. `minRecordAmount` is a human decimal amount converted with the token's decimals. `rebalance_record_inventory` consumes that plan once under the inventory permission and returns an operation ID. The SDK rechecks each input before every step, so a plan whose inventory changed stops before proving.

Each proved transaction ID is checkpointed once the SDK has journaled it and before its broadcast; a proof rejected by the SDK checkpoint handler is never recorded as evidence. The wallet client waits up to ten minutes for each managed write to confirm, matching the per-step inventory timeout. A `complete` operation lists `transactionIds` and `completedSteps`. An interruption with no submitted transaction fails as `not_submitted`. An interruption after submission is `uncertain` with `reasonCode` (`confirmation_timeout`, `inventory_changed`, `transaction_rejected`, `cancelled`, or `interrupted`); `get_operation_status` reconciles the journal until every listed transaction is confirmed or rejected, then reports `failed` with `nextAction: "plan_again"`. A checkpointed ID the journal never recorded is looked up on chain; because the SDK journals every proof before broadcasting it, an ID absent from both resolves as `not_submitted` rather than blocking the wallet. Accepted joins and splits remain on chain, and `resume_operation` never re-executes a plan.

`recover_record_inventory` returns sanitized journal metadata without saved transaction payloads or raw SDK errors. With `rebroadcast: true` it resends saved proved transactions unchanged and reports `rebroadcastAttempts` and `rebroadcastFailed`; broadcast acceptance is not confirmation. Reconciliation first obtains each operation's OS lock. It skips live writers and cancels an abandoned local reservation only if no transaction was prepared. A missing chain response or failed rebroadcast never frees a prepared input. Confirmed inputs remain excluded while the scanner catches up.

The former MCP names `reconcile_record_inventory` and `get_inventory_maintenance` remain callable compatibility aliases, omitted from tool discovery. Use `recover_record_inventory` and `get_inventory_maintenance_status` for new integrations. `check_inventory_maintenance` is no longer an MCP tool; the worker runs checks internally. SDK method names are unchanged.

### Independent concurrent trades

Quote each intended trade separately, then call `execute` with its own quote ID and idempotency key. Different pairs, amounts and routes can run together, including multiple sales of the same token. Every swap keeps its original expiry, route, minimum output and per-operation input cap. If suitable unreserved records are exhausted, prepare inventory or wait for pending records; no replacement trade is submitted automatically.

All participating processes and profile aliases must use the same encrypted state directory and this server version. Record reservations are atomic, identity allocation and whole-list updates use cross-process locks, and each operation holds its own lifetime lock. Claims reserve their selected swap outputs so two requests cannot claim the same output simultaneously. Uncertainty quarantines the affected operation's resources; unrelated managed trades may proceed. Legacy ambiguity and bridge execution retain account-level exclusion. External SDK/CLI stores are not coordinated.

| Operation status | Meaning |
| --- | --- |
| `queued` | Saved and waiting to start. |
| `running` | Preparing or proving a step. |
| `submitted` | Broadcast acknowledged; awaiting confirmation. |
| `pending` | A confirmed step awaits indexing, an output, a claim, or a safe next step. |
| `complete` | Finished; for a swap, its output has been claimed. |
| `uncertain` | Original submission has no established outcome; resources stay held. |
| `failed` | This operation stopped definitively. Earlier accepted maintenance steps and charged fees remain effective. |

The SDK journal separately uses `reserved`, `prepared`, `submitted`, `confirmed`, `rejected`, and `cancelled`. While connected, the MCP checks for unfinished operations every 15 seconds, with at most eight reconciliations in flight. Each completion frees its slot immediately for another due operation; an in-flight ID is never selected twice, and each completed attempt waits at least 15 seconds before retrying. A 60-second recovery deadline cancels the underlying HTTP requests, including stalled response bodies. Recovery uses separate read clients so cancellation does not interrupt writer authentication or active submissions. Shutdown cancels and drains background recovery before closing the store; unresolved proofs and reservations remain durable. Polls never create trades or resume claims. `get_operation_status` provides explicit reconciliation; `resume_operation` advances only a safe claim or bridge step.

### Per-token maintenance

After terminal authorization, call `start_inventory_maintenance` with `token`, `records` (refill target), `minRecordAmount` (human decimal), and optional `replenishThreshold` (low available-record count). Replenishment starts when the number of unreserved records covering `minRecordAmount` is **at or below** the threshold and continues toward the target. The threshold must be an integer from zero to `records - 1`; omitting it preserves the previous behavior of refilling whenever below target. For example, `records: 10, replenishThreshold: 3, minRecordAmount: "0.1"` for USDCx starts refilling at three available records covering 0.1 USDCx and stops once ten are available.

This authorizes recurring replenishment. The MCP does not impose an inventory fee budget; delegated proving requests FeeMaster sponsorship by default. It saves a job scoped to network, account and the canonical underlying token program, schedules an immediate pass, then starts one worker for the state directory. Jobs for different accounts or tokens are independent.

Reservations and record releases persist an activity version alongside the encrypted journal and wake the worker across processes sharing that state directory. Failed reservations and definitive swap shortages also prompt a fresh inventory check; neither creates a failure threshold nor bypasses the available-record threshold. The worker acknowledges activity after completing its check, so a crash or a reservation arriving during a check cannot erase pending work. Filesystem notifications provide prompt wakeups, with a one-second durable-state sweep if a notification is missed. Optional `intervalSeconds` (default 120) controls fallback inventory scans, pending-operation reconciliation and error backoff, including changes made outside this shared journal.

A pass reconciles the existing operation first. If none is unresolved, it counts unreserved covering records and plans a `floor` target when the low threshold is reached or a refill is still incomplete. Veil 0.16.1 floor planning splits available records without joining already suitable records. The worker records the operation ID and moves on; confirmation for one token does not block checks for another. A directly submitted inventory plan participates in the same atomic operation registration. `get_record_inventory` remains an immediate, non-reserving snapshot.

`get_inventory_maintenance_status` returns each job's `enabled`, `target`, `coveringRecords`, `replenishing`, `checkedAt`, `activeOperationId`, `operationStatus` and `lastError`, plus `workerRunning`. The activity observations `reservationFailures`, `shortages` and `lastFailureAt` are account-wide, including all token jobs and profile aliases for that network/account. They are diagnostics, not rebalancing triggers. Status reads only saved observations and worker state; it never triggers a maintenance pass. Snapshot counts are not reservations. `stop_inventory_maintenance` disables new plans for that job; it leaves submitted work available for reconciliation and other tokens enabled. An uncertain operation retains its ID until resolved.

Swaps do not queue for replenishment. `execute` still returns an operation ID; exhausting suitable records before proving produces a definitive `failed` operation with `error.code: "insufficient_records"`, without waiting, re-quoting or submitting a replacement swap. Replenishment can still fall behind demand or run out of splittable funds. Choose a minimum record amount and threshold appropriate for the intended swaps; a reservation failure does not change those settings. Unknown submission outcomes keep their reservations and require recovery of the original operation.

The worker uses an OS-held lock rather than persistent PID ownership. One worker per state directory hosts the token jobs, with at most one active inventory operation per network/account/underlying program. It stays alive while idle; the available-record threshold resumes replenishment without creating another process. After an explicit start, the live MCP server checks service health every five seconds and replaces an exited worker while any job is enabled. The replacement acquires the same worker lock and reconciles saved operations before planning new work. This health check does not decide when to rebalance.

By default the worker is attached to the MCP server that launches it: closing that server's stdin, stopping the server, or losing the parent process stops the worker. Shutdown disables that server's supervision, stops scheduling new checks and allows up to ten seconds to drain; a worker that cannot finish is terminated. Jobs, reservations, and transaction evidence stay saved for recovery, and submitted transactions are not undone. Starting a worker again reopens those jobs; opening an MCP connection alone does not restart maintenance. Separate state directories do not coordinate the same account's reservations.

Choose the lifetime when launching the MCP server:

```sh
shield-swap-mcp serve --maintenance-mode attached  # default; stops with this server
shield-swap-mcp serve --maintenance-mode detached  # continues after this server exits
```

`SHIELD_SWAP_MCP_MAINTENANCE_MODE=attached|detached` sets the same option for hosts that configure environment variables, including the Claude launcher; an explicit command flag takes precedence. The setting applies to workers this server launches. If a worker already owns the state directory, another MCP server reuses it without taking over its lifetime. Stopping that second server does not stop the owner's worker. To change an existing worker's lifetime, stop its owning server or service before starting a replacement.

The lock reports worker activity, not a process ID or a remote shutdown endpoint. An owning MCP server can force-stop its child even if the worker is unresponsive. After the parent itself is killed, IPC-loss handling and the worker's own shutdown deadline require a responsive worker event loop; use OS service supervision if a strict process-tree cleanup guarantee is required.

Run `shield-swap-mcp maintain` directly for an independent foreground worker, or under a service manager for automatic restart. Credentials come from the same environment or encrypted state, never tool arguments.


## Current limitations

- Privy/Dynamic EVM/Solana adapters are checked offline. Production provider authentication, wallet policies, and funded hosted-wallet execution have not yet been validated.
- Aleo bridge inputs currently use public balances. Private-record burns are not exposed. Inbound xReserve transfers support public, record, and private mint modes.
- Bridge quotes display SDK fees, which the SDK recalculates before execution; token input caps do not cap network gas fees.
- Bridge recovery requires this server's saved checkpoints. It does not import arbitrary external transactions.
- Inventory maintenance pays public fees or uses FeeMaster; managed private fee selection is not exposed. Rebalances run one at a time per token; swaps may use other available records concurrently.
- Concurrent swaps and threshold-driven replenishment have been exercised with one testnet account. This does not establish a throughput guarantee or live multi-account coverage. Rebroadcast of a saved inventory transaction has not been exercised live.
- Normal swap status checks use the current output, active claim or saved claim result. When recovery needs history, it selects the affected identities and grows its scan from 10 to at most 160 pages on incomplete polls. Explicit account-wide discovery and old-operation recovery can still take longer than a 60-second client timeout. Background attempts stop after their 60-second deadline and retain unresolved state; unusually deep histories may need an explicit status check with a longer client timeout. SDK identity/history updates share an identity lock and can delay new identity allocation.
- Queued operations run inside the server process. Graceful MCP shutdown drains them; a process crash interrupts them; a rebalance interrupted before its first proof reconciles to `not_submitted` and its reservations are released on the next reconcile.
- Aleo-to-Ethereum xReserve recovery confirms the source burn, but SDK 0.16.0 does not verify the Ethereum release. Its status remains `DELIVERY_PENDING` with `nextAction: "verify_destination_externally"` and `deliveryVerification: "unsupported_by_sdk"`; inspect destination delivery independently and do not repeat the transfer.
- History discovery probes a bounded identity window and reports incomplete coverage; it cannot promise discovery across arbitrary missing counter gaps.
- Existing Shield Swap CLI file stores and inventory journals do not share this package's encryption, locking, or record reservations. Do not operate the same wallet concurrently through an uncoordinated CLI or another state directory.
- Permission changes are refused while the profile has a queued, running or submitted operation.

## Testnet validation

The following evidence predates this concurrent MCP implementation. It does not validate the new concurrency or maintenance worker on chain.

On 2026-11-02, the built stdio server used an existing funded testnet wallet, Veil 0.16.0, and fee sponsorship for these checks through one persistent server process:

| Flow | Evidence |
| --- | --- |
| `plan_record_inventory` for 8 credits records of at least 5 ALEO (`preserve`) | 18 inputs planned as 2 joins and 7 splits; the plan joined every record, including the two that already qualified. |
| `rebalance_record_inventory` | Completed all 9 steps in 113 seconds; the journal lists each transaction with its fee (53,320 and 3,833 microcredits for the joins, 0 for the sponsored splits). Inventory afterwards: 8 records of 668.74 ALEO. |
| Three rebalances interrupted before proving | Reservations left by killed server processes were reported as `cancelled` by the next reconcile and the operations reconciled to `not_submitted`. |
| 0.1 USDCx → ETH swap | Reserved one USDCx record, confirmed with a 939,822 microcredit fee, reported `claimable`. |
| `claim_unclaimed_swaps` | Claimed 50,676,718,961,226 output base units; the claim entry joined the journal with no record inputs. |

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

Run `pnpm test`, `pnpm run typecheck`, and `pnpm run build`. Tests cover SDK quote retention, encrypted persistence, idempotency, delayed confirmations, submission uncertainty, concurrent recovery, OS lock release after a crash, terminal key import, provider identity matching, hosted EVM/Solana signing, paused bridge routes, and stdio restart. Inventory tests cover atomic reservations across two state handles, the SDK's release rules for rejected and cancelled entries, durable plans with bigint round trips, permission gating without an inventory fee limit, prepared-transaction evidence after an interruption, evidence withheld for a proof the SDK rejects, reconciliation to `plan_again`, chain lookup of an unjournaled ID, release of reservations orphaned before proving, and plaintext-free reads. Onboarding tests cover missing/locked/configured accounts, guided profile reuse, public-only and insufficient private holdings, and scanner failures. They use temporary test wallets without submitting transactions. Launcher tests use a local stand-in for Claude to check intro loading, account reuse, credential isolation, two MCP connections, cleanup, and failed unlocks. These checks do not establish that a real model reproduces the intro verbatim.

After installing the tarball into an independent project, run:

```sh
node scripts/smoke-installed.mjs /absolute/path/to/independent-project
node scripts/smoke-installed-recovery.mjs /absolute/path/to/independent-project
node scripts/smoke-installed-permissions.mjs /absolute/path/to/independent-project
```

The recovery smoke requires Node 22.15 or newer for module hooks. It runs the installed CLI over MCP with simulated SDK outcomes, checking preparation failure, partial batches, uncertain submission, confirmed rejection, and explicit resume across three process restarts. It uses disposable test wallets and makes no network calls or transactions.

The permissions smoke exercises form approval and decline, unsupported-client fallback, persisted grants across three MCP sessions, and form/terminal revocation. It uses a disposable account without network calls or transactions; the client simulates form responses, so this does not verify any particular host's confirmation UI.

This checks the installed SDK/WASM files, local key import, encrypted state, guided profile reuse, structured readiness, all 28 tool schemas over stdio, and restart. No real wallet material belongs in this repository.
