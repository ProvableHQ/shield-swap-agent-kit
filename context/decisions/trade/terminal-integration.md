# Integrate a trading terminal

First distinguish three requests: use Shield Swap alongside a terminal, consume its data as a signal, or add Shield Swap execution inside that terminal. They require different integration access.

| Product | Product-specific context |
| --- | --- |
| Axiom | [Axiom](../../integrations/axiom.md) |
| GMGN | [GMGN](../../integrations/gmgn.md) |
| terminal.pump.fun | [Terminal](../../integrations/terminal.pump.fun.md) |
| fomo.family | [fomo](../../integrations/fomo.family.md) |

## Connector boundary

A connector translates a supported external event/order interface into the selected trading workflow. It must preserve the external order/event ID, venue, chain, asset identifiers, units, timestamp, and account binding. It then obtains a separate Shield Swap quote and checks the authorized limits before execution.

Do not map assets by ticker alone. A token shown on another chain is not automatically listed, bridgeable, or equivalent to an Aleo asset. Verify the destination token/program and route before funding or quoting.

External order acceptance, external fill, Shield Swap submission, and Shield Swap claim are different states. Persist both legs and reconcile them independently. A cross-chain connector is not an atomic swap just because both actions appear in one interface.

## Implementation sequence

1. Verify a documented API, supported SDK, webhook, or partner extension for the exact product/version. A webpage used by humans is not proof of an automation API.
2. Start with read-only data or a user-supplied signal; preserve source timestamps and reject stale or duplicate events.
3. Add quote-only Shield Swap evaluation and show both venues' terms and costs.
4. Enable narrowly authorized execution only after restart, duplicate-event, partial-fill, and unknown-submission tests pass.

There are no working terminal connectors in this kit yet. Product pages explain the verified external surface and the missing integration work. Do not replace missing support with undocumented session-cookie endpoints or claim that a protocol SDK controls the terminal's account.

For immediate standalone trading, return to [CLI setup](setup-trading-tools.md). For multi-venue execution, read [arbitrage](../../strategies/arbitrage.md) and [unattended trading](../../safety/unattended-trading.md).
