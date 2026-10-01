# Banana Gun

Status: integration guidance only; AgentKit has no Banana Gun connector. Sources checked 2026-10-01.

Banana Gun documents separate Telegram trading products and a Banana Pro web interface, with spot trading, sniping, limit orders, and copy-trading workflows. Select the exact product and chain before designing a connector. [Official product guide](https://docs.bananagun.io/).

Its [Telegram scraper guide](https://docs.bananagun.io/resources/telegram-scraper.md) describes a Telegram-client setup using account credentials. That is not a general Shield Swap execution API and should not be installed as an incidental part of AgentKit setup.

## Choose the integration scope

For a user-provided signal, keep its source chain/token, message ID, timestamp, and intended order separate from the Shield Swap operation. Validate an actual Aleo asset mapping; a sniped or copied token may have no supported destination representation.

For direct product control, obtain the appropriate documented API or partner integration and verify wallet/account authorization, order status, cancellation, and replay behavior. The reviewed guides do not establish a public general-purpose trade API for this kit.

## Strategy checks

A channel signal, a copied trade, and a confirmed fill are different events. Decide which event is the trigger. Replaying a Telegram message after reconnect must return the prior operation instead of opening another position.

If the product already owns an entry or exit order, avoid installing a second independent trigger for the same leg. Multi-chain strategies need separate inventory and recovery on each chain; an API timeout is not a failed trade.

Do not share Telegram credentials, wallet keys, or Shield Swap claim handles through chat. Keep product authentication separate from the Aleo signer and protected store.

Continue with [bot integration](../decisions/trade/bot-integration.md) or [terminal integration](../decisions/trade/terminal-integration.md), depending on the selected product.
