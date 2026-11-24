# Python reference bot

The reference trades one direction: sell the configured base asset on Shield Swap, claim the proceeds, then buy the same base-asset quantity on Uniswap v3. Its inputs describe the exact corresponding assets, not interchangeable ticker strings.

Copy the Python modules from the companion `trading-integration` skill into your application, then add:

- [arbitrage.py](../assets/python/arbitrage.py): exact amount conversion and conservative net-result calculation.
- [uniswap.py](../assets/python/uniswap.py): real RPC quotes, bounded approvals, exact-output swaps, and receipt inspection.
- [cycle.py](../assets/python/cycle.py): persistent coordination of the two legs.
- [bot.py](../assets/python/bot.py): the callable `ArbitrageBot` and its `Strategy` configuration.

Install the latest published packages in your environment:

```sh
python -m pip install --upgrade shield-swap-sdk web3
```

Reuse your configured Shield `Trading` instance. Construct `UniswapV3` with your Web3 provider, chain ID, QuoterV2, original v3 SwapRouter, base-token address, quote-token address, and pool fee tier. Verify addresses in [Uniswap's deployment reference](https://developers.uniswap.org/docs/protocols/v3/deployments). This adapter uses the original router's deadline-bearing ABI. SwapRouter02 and Universal Router have different interfaces; do not substitute their addresses.

For WETH/USDC, the EVM base asset is WETH and the quote asset is USDC. Discover the corresponding Shield asset IDs and decimals through its SDK. Confirm their underlying asset relationship. Keep the network explicit; Aleo testnet assets cannot be valued against Ethereum mainnet funds as an arbitrage opportunity.

`Strategy` requires these values:

| Field | Meaning |
| --- | --- |
| `shield_base`, `shield_quote` | Registry symbols or IDs used for discovery. |
| `shield_base_id`, `shield_quote_id` | Verified on-chain IDs, checked against every quote. |
| `base_amount` | Fixed trade size as decimal text in base-asset units. |
| `slippage_bps` | Integer slippage allowance, applied to each leg's bound. |
| `max_age` | Maximum local quote age in seconds, at most 60. |
| `costs` | Conservative additional costs in quote-asset decimal units: gas, proving/claim fees, later rebalancing, and any chosen contingency. Exclude fees already embedded in quotes. |
| `min_profit` | Minimum conservative net result in quote-asset decimal units. |
| `equivalence_confirmed` | Explicit confirmation that both base assets and both quote assets represent the intended economic pair. |
| `gas_budget_wei` | Maximum gas allocation for each EVM transaction, in wei. Include network-specific extra fees in `costs`. |
| `confirmations` | EVM block confirmations required before completion. |

Create `ArbitrageBot(shield_trading, uniswap, strategy, state_path)`. These are application objects, not shell commands. The main entrypoints are:

```python
def observe(bot):
    plan = bot.plan()
    return plan['decision']  # Eligible, funding readiness, and exact net amount.

def run_one_authorized_cycle(bot, cycle_id, reviewed_plan):
    return bot.execute(cycle_id, reviewed_plan)

def continue_original_cycle(bot, cycle_id):
    return bot.resume(cycle_id)
```

`plan()` reads metadata, quotes, record inventory, EVM balances, and allowance. It signs nothing. An account and API authentication may still be required by the configured Shield service. A missing balance or allowance makes the plan ineligible.

Supply an existing in-memory EVM signer only for execution. The adapter never generates or imports an account itself. `approve(id, amount, gas_budget_wei=...)` is an explicit, bounded setup transaction. Complete its receipt check before requesting execution quotes. The bot does not add an approval transaction inside a time-sensitive arbitrage cycle.

After a Shield claim completes, the bot obtains a fresh Uniswap quote. The new purchase must still meet the threshold and cannot exceed the original reviewed maximum input. A lost opportunity leaves unmatched inventory and stops new cycles. It never widens slippage or changes the asset pair.

Tests use `python -m unittest discover -s . -p 'test_*.py'` after copying both sets of modules and tests. Run them with installed SDK dependencies so the native quote and ABI checks execute too.
