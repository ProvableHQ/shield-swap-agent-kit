# Python integration

Copy [operations.py](../assets/python/operations.py), [trading.py](../assets/python/trading.py), and [shield.py](../assets/python/shield.py) into the application's package. Adjust their local imports to that package's conventions. Keep the maintained tests alongside the integration.

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

Execution is a separate application choice. After the account, trade limits, fees, and operation are authorized, construct `Trading(..., max_in_flight=..., execution_enabled=True)` and call `execute(request_id, offer)`. Poll `status(request_id)` and call `claim(request_id)` only for `submitted` operations. Inspect the returned `status`, `result.amount_out`, and `result.amount_remaining`; do not treat a submission as received funds.

For concurrent trades, pass distinct `(request_id, offer)` pairs to `execute_many`. Each offer can have different assets, amounts, and routes. Each trade needs an unreserved covering record. Inventory reshaping is a separate reviewed action using the SDK planner, not an automatic response to any error.

Run the copied tests with:

```sh
python -m unittest discover -s . -p 'test_*.py'
```

Keep the SDK store open while operations are active, and close it when the owning application shuts down. Never replace its database to clear an error.
