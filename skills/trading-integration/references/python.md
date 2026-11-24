# Python integration

Copy [operations.py](../assets/python/operations.py), [trading.py](../assets/python/trading.py), [shield.py](../assets/python/shield.py), and [workflow.py](../assets/python/workflow.py) into the application's package. Adjust local imports to its conventions. Keep the maintained tests alongside the integration. These modules do not start a bot or submit anything on import.

Install from PyPI in the consumer's environment:

```sh
python -m pip install --upgrade shield-swap-sdk
```

Reuse an existing authenticated `ShieldSwap` client and `Aleo` client when available. Configure the Aleo client with `RecordManagementConfig(enabled=True, store=SqliteRecordInventoryStore(...), chain_id=...)`; bind a durable `Journal` to the DEX client. Use one reservation store and identity journal for every writer of the account on that network. Existing state paths take precedence over a new example directory.

For a new integration using an existing account, `open_session` accepts its private key in memory. Obtain it through the project's existing account loader or authorized environment; the helper never writes it to a file. It authenticates, but does not register the scanner or fund the account. Supply `ALEO_ADDRESS`, `NETWORK`, and `STATE_ROOT` from the selected setup. The state directory is owner-only. If the application already has SDK journals, retain its client and those exact paths instead of opening new state.

```python
import os
from pathlib import Path
from shield import open_session
from trading import Trading

venue = open_session(private_key=os.environ['SHIELD_SWAP_PRIVATE_KEY'],
    address=os.environ['ALEO_ADDRESS'], network=os.environ['NETWORK'],
    state_root=Path(os.environ['STATE_ROOT']))
trading = Trading(venue, Path(os.environ['STATE_ROOT']) / 'operations.sqlite')
offer = venue.quote('ETH', 'USDCx', '0.001', slippage_bps=50, max_age=20)
print(offer.native['minimum_amount_out'])  # Decimal output-token units; no trade.
```

The symbols and size above illustrate a quote. Discover metadata with `venue.dex.api.get_tokens()` and pools with `venue.dex.api.get_pools()` before choosing a real trade. `venue.inventory(token)` returns available and reserved records in base units. A total balance can cover several trades while only one record is available to spend.

## Submit one authorized trade

Supply a configured venue, the original reviewed offer, the existing operation-database path, an order/event ID, and the approved concurrency limit. The function below performs writes. Read [fees and proving](fees.md) before selecting its execution configuration.

```python
from trading import Trading
from workflow import progress

def submit_authorized_trade(venue, state_path, request_id, offer, max_in_flight):
    trading = Trading(venue, state_path, max_in_flight=max_in_flight,
                      execution_enabled=True)
    return progress(trading.execute(request_id, offer))
```

The result contains `status`, public transaction IDs when known, and actual output/refund amounts when complete. `submitted` is a normal result: this function does not run an unbounded claim loop. Do not print the raw operation row, which can contain secret claim material.

## Continue after restart

Reopen the original account/network, SDK stores, and operation database. Keep the original request ID. The scheduler below continues a known submission; it does not quote or submit another swap. It can make the first claim, so retain that action's authorization.

```python
import time
from trading import Trading
from workflow import continue_trade

def continue_original_trade(venue, state_path, request_id, max_in_flight,
                            attempts=12, interval_seconds=5):
    if attempts < 1 or interval_seconds <= 0:
        raise ValueError('Use a bounded positive polling policy')
    trading = Trading(venue, state_path, max_in_flight=max_in_flight,
                      execution_enabled=True)
    for attempt in range(attempts):
        result = continue_trade(trading, request_id)
        if result['status'] != 'submitted':
            return result
        if attempt + 1 < attempts:
            time.sleep(interval_seconds)
    return result  # Still pending; retain the same request and stores.
```

Polling limits bound calls, not an in-flight SDK request's timeout. `submission_unknown`, `claim_unknown`, `submitting`, or `claiming` requires [inspection](recovery.md). A `complete` result has a confirmed claim; check scanner visibility separately before spending its output in another trade.

## Fit the existing application

The reference uses the synchronous SDK. In an async server, run this blocking work in an appropriate worker or adapt to the published async SDK while preserving durable checkpoints and account-wide coordination. Do not block the request/event loop with proving or polling. Return the application ID to the caller and let the existing scheduler check it.

Use one database per chosen application scope and share SDK coordination with every writer of the account. Reopening paths is deliberate; creating a fresh temporary directory on each request loses recovery state.

For concurrent trades, follow [the inventory and batch recipe](concurrency.md). `execute_many` takes distinct `(request_id, offer)` pairs with potentially different assets, amounts, and routes. The batch needs a covering record for each simultaneous input.

Run the copied tests with:

```sh
python -m unittest discover -s . -p 'test_*.py'
```

Keep the SDK store open while operations are active, and close it when the owning application shuts down. Never replace its database to clear an error.
