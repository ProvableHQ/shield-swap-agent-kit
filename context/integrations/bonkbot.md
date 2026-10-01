# BONKbot

Status: integration guidance only; AgentKit has no BONKbot connector. Sources checked 2026-10-01.

BONKbot documents a Telegram trading interface connected with its Telemetry terminal, including preset quick-buy behavior. The reviewed product guides do not establish a public trade API for this kit. [BONKbot overview](https://docs.bonkbot.io/bonkbot), [product documentation](https://docs.bonkbot.io/).

## Keep the bot boundary explicit

Decide whether the user wants to trade in BONKbot, supply a BONKbot-derived signal to a separate Shield Swap agent, or build an integration with the product. These are not interchangeable requests.

For a signal-driven Shield Swap worker, identify the allowed signal source, original event/message ID, source chain and token, timestamp, and size rule. Resolve the Aleo token independently. Receiving a token address in chat is not sufficient authorization to trade it.

A BONKbot/Telemetry shared product workflow does not imply an external API or shared signer usable by this kit. Obtain documented partner/API access before automating product orders; do not reconstruct Telegram session-control calls or export keys as a shortcut.

## Strategy checks

Quick-buy presets can create a second trade if both the product and the Shield Swap worker react to the same event. Assign the execution owner for each leg, deduplicate events, and inspect existing in-flight work before acting again.

Confirm which system owns take-profit/stop-loss triggers and cancellations. Shield Swap must still complete its separate claim before the resulting inventory is available.

Use [bot integration](../decisions/trade/bot-integration.md) for worker/account binding and [unattended trading](../safety/unattended-trading.md) for enforceable limits.
