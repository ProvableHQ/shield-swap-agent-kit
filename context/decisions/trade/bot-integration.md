# Integrate a trading bot or chat application

Use this page for a bot that receives trade requests or signals and calls Shield Swap. For existing products, read [BONKbot](../../integrations/bonkbot.md) or [Banana Gun](../../integrations/banana-gun.md) before assuming a supported connector exists.

For an operational **Connect trading tools** journey, verify the product supports the intended integration, then complete [account setup](../../shield-swap-setup/configure-account.md), [Shield Swap access](../../shield-swap-setup/configure-shield-swap.md), and [funding](../../shield-swap-setup/bridge-funds.md). Bind the integration to that same account and recovery state. Read-only development can start earlier, but it is not a funded trading connection. Explicit code-only or dry-run requests may stop at their requested milestone.

## Build a one-account bot

For reusable functions or a running strategy, load [trading integration](../../../skills/trading-integration/SKILL.md). It supplies native Python and TypeScript/JavaScript modules with stable request IDs, SDK record coordination, and durable progress through claims. For a two-venue strategy, load [arbitrage](../../../skills/arbitrage/SKILL.md).

Keep the selected signer, network, and existing SDK durable store. Start with one requested swap and finish its claim. Enable concurrent requests only with shared record reservations and explicit operation limits. Recover an unknown result through its original state before replacing that operation.

A refund or partial fill is the outcome of that operation. Report the actual output and refund before deciding whether another trade is wanted.

A new one-account bot does not need a deployment framework, a distributed scheduler, or an inventory-maintenance daemon. Add those only when the application's workload requires them.

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
