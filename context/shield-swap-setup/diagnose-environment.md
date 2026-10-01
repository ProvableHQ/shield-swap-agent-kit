# Diagnose the environment

Diagnose the selected setup without creating accounts, requesting funds, or submitting test swaps. There is no bundled AgentKit `doctor` executable yet.

## 1. Check installation and state selection

For the installed CLI:

```sh
node --version
shield-swap --help
```

For a Veil application:

```sh
node --version
npm ls @provablehq/veil-aleo-sdk @provablehq/shield-swap-sdk
```

For Python:

```sh
python --version
python -m pip show shield-swap-sdk aleo-sdk
```

Record versions, operating system, selected network, public account address, endpoint hostname, and state-directory location. Do not dump environment variables or account files.

CLI state is relative to the working directory. Python profiles retain their stored network. Use [account verification](configure-account.md) before interpreting empty state as a new account. Stop rather than run setup with `--new` to repair an existing account.

## 2. Separate the service checks

| Layer | Check | What success establishes |
| --- | --- | --- |
| Node | Read the configured chain height or a known transaction. | Node connectivity for that network. |
| DEX API | Use the existing [authentication recipe](configure-shield-swap.md), then a requested API read. | Access to that API session, not prover/scanner health. |
| Private records | Run the [private-balance recipe](bridge-funds.md). | The selected scanner can currently return holdings. |
| Recovery state | Inspect [history](swap-history.md), including unknown entries. | Local tracking exists; not that every operation settled. |
| Proving | Inspect the actual failed operation's stage and identifiers. | Requires [proving diagnosis](../troubleshooting/proving-failures.md), not a new trade. |

Veil node read — save as `check-node.mts`, run `npx tsx check-node.mts`:

```ts
import { getBlockNumber } from '@provablehq/veil-core'
import { client, network } from './session.mts'

const height = await getBlockNumber(client)
console.log({ network, height: height.toString() })
```

Add `@provablehq/veil-core` as a direct compatible dependency when importing it. The wallet client does not automatically expose every public-read action as a method.

Python DEX indexer read — save as `check_indexer.py`, run `python check_indexer.py`:

```python
from authenticate import dex

state = dex.api.get_protocol_state()
print({
    "revision": state.revision,
    "ready_for_quote": state.freshness.ready_for_quote,
    "ready_for_entry": state.freshness.ready_for_entry,
    "indexed_block": state.freshness.indexed_block,
    "lag_blocks": state.freshness.lag_blocks,
})
```

DEX indexer freshness is not private-scanner progress. Python `status()` can fall back to public-only balances; use `get_balances()` to surface private-scanning failures.

## 3. Report the smallest actionable failure

Include the failed stage, sanitized error type/status, package versions, network, and public transaction/job ID if present. Exclude credentials, raw API bodies, private records, and handles.

A read-only probe may still authenticate or register the configured scanner. Use an already selected account and approved services. Do not call `onboard()`, construct a swap, or invoke `simulate()` as a harmless health check: those can create state or authorization material.

Route failures through [error handling](error-handling.md), [scanner lag](../troubleshooting/scanner-lag.md), [record contention](../troubleshooting/record-contention.md), or [proving failures](../troubleshooting/proving-failures.md).
