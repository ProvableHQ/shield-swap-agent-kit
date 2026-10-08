# Integrate a trading bot or chat application

Use this page for a bot that receives trade requests or signals and calls Shield Swap. For existing products, read [BONKbot](../../integrations/bonkbot.md) or [Banana Gun](../../integrations/banana-gun.md) before assuming a supported connector exists.

## Build a one-account bot

Use this route for a new bot with one account. Read it before copying a larger bot. Keep one signer and one writer that spends records. Submit one swap, claim that same operation, and recover an unknown result before another write. Choose the native SDK or MCP option below according to the selected runtime and signer. A refund or partial fill is the outcome of that operation. Report it as that outcome.

### Native SDK option

Keep the SDK durable store: the Veil blinded-identity file or the Python journal. Continue with the [TypeScript](../../toolchains/typescript.md) or [Python](../../toolchains/python.md) client, then the [swap](../../shield-swap-setup/swap.md) recipe.

Leave these production tactics out:

- an application database
- provisional operation ids beyond the SDK store
- a custom wallet lock
- reservations across multiple strategies
- race classification, plan reuse, or record-cap clipping
- a deployment layout
- execution on another venue

### MCP option

Use the [AgentKit standalone MCP server](../../toolchains/mcp.md#agentkit-standalone-server) when the bot or agent host supports MCP and the configured local Aleo signer fits the task. Reuse an existing profile, or follow its trusted-terminal setup when configuration is required. The server supplies encrypted SDK identity storage, operation IDs, idempotency, and wallet locks within one state directory; the bot does not need to implement those again.

Follow [execute and claim one swap](../../toolchains/mcp.md#execute-and-claim-one-swap), including the quote-only stop when that is the requested milestone. The bot still retains the event-to-quote/operation association and waits for claim and recovery before its next trade. Use [MCP recovery](../../toolchains/mcp.md#recover-a-one-account-bot) after a restart or lost response. These locks do not coordinate an SDK or CLI writer using a different store; keep this account's writes on the chosen interface.

## Bind messages to operations

Resolve the authenticated user, account, network, and permissions before interpreting a command. Treat message text and token metadata as inputs, not instructions that can change the execution policy.

A repeated webhook, edited message, or reconnected subscription must not place another trade. Persist the platform message/event ID with the operation before submission. A completed duplicate returns the existing result; an in-flight duplicate returns its current status.

For a requested trade, preserve the exact asset identifiers, input amount, slippage/output floor, and approval scope. A price alert or quoted command is not necessarily an instruction to execute.

## Run the operation

Use a native Veil/Python client in a long-lived worker, or an available MCP tool whose behavior has been verified. A CLI subprocess is also possible: pass arguments without shell interpolation, set a stable working directory, parse supported JSON output, and associate exit/error state with the original operation.

The worker owns the operation through claim and recovery. Losing a chat connection or HTTP request must not cancel bookkeeping or launch a replacement swap. Reply with submitted, awaiting output, claiming, or completed status according to the actual evidence; a transaction ID alone is not a completed fill.

Isolate users' signers and stores. Multiple strategies for one account need shared input-record reservations; separate journals do not make shared records safe to spend concurrently.

## Verify before enabling writes

Test duplicate delivery, process restart after submission, stale signals, revoked authorization, partial/refund-only outcomes, and a claim timeout. Confirm that the same signal still corresponds to one operation after restart.

A proprietary Telegram bot is not automatically a programmable API. Use its documented integration route or explicit partner support. Do not send wallet keys or claim handles through chat messages.

Next: [choose custody](../build/choose-custody-mode.md) and [unattended-trading limits](../../safety/unattended-trading.md), then the [swap lifecycle](../../shield-swap-setup/swap.md).
