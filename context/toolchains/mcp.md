# MCP

AgentKit includes a [draft standalone TypeScript server](../../mcp/README.md) in `mcp/`. Installing the skill does not install its dependencies, register it, or launch it. Existing SDK servers expose different interfaces; inspect the selected implementation and actual tool catalog before making calls.

Use an available MCP connection for capabilities it actually exposes when it fits the requested workflow. If a required capability is missing, consider a supported SDK or CLI path that the host can run while preserving the account and recovery state; see [tool selection](../../tools/SKILL.md). The standalone server README contains its current setup instructions and tool catalog. Its validation section records which wallet and route combinations have been exercised; do not infer coverage for other combinations.

## AgentKit standalone server

The draft server pins published Veil packages to 0.12.0 and runs over stdio on Node.js 22.13 or newer. `setup` reports structured account/funding checks and next-step guidance for the [canonical journeys](../getting-started.md); signing keys and execution permissions are configured only in the trusted terminal. Starting an unconfigured server does not create an account.

Its swap workflow is `quote` → `execute` → operation polling → `claim_unclaimed_swaps`. Executions consume durable quotes using idempotency keys. `swap_history` reads the encrypted identity store and reports recovery coverage. SDKs still own transaction construction, signing, and protocol logic; this server adds transport, operation IDs, encrypted storage, and local policy enforcement.

Offline tests and an independently installed tarball verify terminal key import, encrypted persistence, stdio discovery, restart, and recovery failure cases. Bridge regressions cover SDK recovery, destination verification, and lost RPC responses. Separate mainnet checks completed a local Aleo swap and claim, an Ethereum-to-Aleo ETH bridge, and a USDC round trip. The return USDC payment was inspected independently; SDK status still requires external destination verification. Follow the [server README](../../mcp/README.md) for the current limitations.

## Quote on an existing profile

These recipes describe the AgentKit standalone server. Inspect the connected catalog before using them with another server. Tool arguments below are MCP calls, not shell commands; substitute values from the user and prior tool responses.

1. Read `get_config({})` and `list_wallets({})`. Select the existing `profileId` and check its public Aleo address and network. No setup is needed for a configured profile. If configuration is missing, `setup({})` reports the terminal steps; it does not create or fund an account.
2. Resolve the requested assets with `list_tokens` and, when needed, `list_pools` on that profile. Preserve the requested pair, human decimal amount, and slippage.
3. Call `quote` with those values. It authenticates through the configured session and saves a quote locally, but does not submit a transaction or require funded input records.

```json
{"name":"quote","arguments":{"profileId":"SELECTED_PROFILE","from":"TOKEN_IN_ID","to":"TOKEN_OUT_ID","amount":"1.5","slippageBps":50}}
```

The amount and slippage above are illustrative, not authorization. Return `quoteId`, `network`, `address`, `amountIn`, `expectedOut`, `minOut`, route, and `expiresAt`. Input `amount` is a human decimal string; returned amounts are base-unit strings with token decimals. Stop here for a quote-only request. Do not call `execute` or request funding. Quotes expire at the earlier of the SDK expiry and the server's 60-second limit; apply a stricter user-supplied age limit in the caller.

## Execute and claim one swap

Use the selected profile throughout. The requested trade must fit the permissions, per-operation token cap, and maximum slippage configured in the trusted terminal. `update_config` cannot grant these permissions. A quote-only session can leave swaps, claims, and bridges disabled.

1. Save the returned `quoteId` and a stable idempotency key for this signal before submission. Check the quote's network, account, route, input, minimum output, and expiry against the authorized trade.
2. Call `execute` and retain the returned `operationId`:

```json
{"name":"execute","arguments":{"quoteId":"SAVED_QUOTE_ID","idempotencyKey":"signal-123:swap"}}
```

3. Poll `get_operation_status` with that operation ID. `submitted` is not a completed fill. When the original `swapId` is claimable, claim only that output with a separate stable key:

```json
{"name":"claim_unclaimed_swaps","arguments":{"profileId":"SELECTED_PROFILE","swapIds":["ORIGINAL_SWAP_ID"],"idempotencyKey":"signal-123:claim"}}
```

4. Save and poll the claim operation ID. After claim completion, reconcile the original swap with `get_operation_status` and inspect `swap_history` with `reconcile: true`. Verify the claim transaction, `amountOut`, and `amountRemaining` before reporting the outcome. An all-input refund or partial fill is an outcome of this operation, not permission to create a replacement trade. The server returns amounts rather than a dedicated fill classification; interpret them with the [history guide](../shield-swap-setup/swap-history.md#interpret-amounts-and-completeness).

Omitting `swapIds` takes a snapshot of up to 20 claimable swaps. The single-trade workflow always supplies the original ID so it does not claim unrelated trades.

## Recover a one-account bot

Keep the same state directory, profile, and event-to-quote/operation association across restarts. The server persists SDK claim material and operation checkpoints. The caller retains the small association between its own signal ID and the returned quote/operation IDs; this does not require building a second wallet store or locking layer.

- After a lost `execute` response, repeat only the same `quoteId` and idempotency key to retrieve the original operation. A new quote with the same key produces `idempotency_conflict`; it is not a retry mechanism. A lost claim response uses the identical profile, selected swap IDs, and claim key.
- With a saved operation ID, call `get_operation_status`. `resume_operation` reconciles an uncertain swap without repeating its deposit; for a claim it resumes only when the backend identifies a safe next step. An unresolved result remains pending or uncertain.
- If the caller lost its association, inspect `list_operations` for that profile and `swap_history` with `reconcile: true`. The operation list is bounded and has no signal-ID lookup; history reports bounded recovery coverage. Do not guess which operation belongs to a signal or create a replacement when the evidence is incomplete.
- Before the bot accepts another trade, finish the current claim or resolve the original outcome. The server serializes wallet writes and blocks queued, running, or uncertain operations, but that is not a strategy scheduler or a guarantee that every submitted swap has already been claimed.

The standalone server's locks coordinate profiles and processes using its state directory. A separate SDK/CLI store or another MCP state directory is not coordinated. Preserve one writer for this account instead of switching interfaces to work around a pending operation.

## TypeScript SDK interface

`createShieldSwapMcpServer(...)` from `@provablehq/shield-swap-sdk/mcp` returns tool definitions and `handleToolCall`. It does not start a process or implement stdio/HTTP transport. A host must wire MCP initialization, tool listing, invocation, result formatting, and errors to a transport.

`createShieldSwapAgentTools(...)` from the SDK's `/agent` entrypoint provides schemas and handlers for framework integrations. Reuse these definitions. Tool presence depends on the configured client/API and options.

`includeWrites: false` excludes money-moving tools, but authentication and API-token mutations can still be present when their backing clients are configured. Select an actual read-only tool set before advertising a read-only server. Tool metadata alone does not enforce a spending policy.

## Existing Python server

The Python SDK has a stdio entrypoint. Its package documents installation and launch as:

```sh
python -m pip install 'shield-swap-sdk[mcp]'
python -m aleo_shield_swap.mcp
```

These commands describe the existing SDK server, not an AgentKit server or a required setup step. Evaluate and pin the dependency version before using it with an account.

The inspected server binds `ALEO_PRIVATE_KEY` when supplied, otherwise creates/loads a signing profile through `ShieldSwap.from_profile()`. Omitting the environment key does not make it read-only. Resolve the profile before launch. Its fallback does not forward the initially read network/endpoint settings into `from_profile()`; inspect the profile's stored configuration.

Its catalog exposes lifecycle operations including onboarding, batch swaps, liquidity, and collection. The inspected version does not expose separate quote, single-swap, and individual-claim tools. Do not promise SDK/MCP parity or invent tool names.

## Using a connected server

Confirm the account, network, advertised tools, and enforced permissions. Call only tools appropriate to the requested task. A tool list containing `swap` does not itself authorize a trade. Read [permissions](../safety/permissions.md) and [private keys and state](../safety/private-key-handling.md) before configuring signing access.

A documentation MCP searches reference material. An operational MCP calls SDK/API functions. Connecting either one does not connect the other, and adding an operational server does not automatically load this skill's context.
