# Discover pools and get quotes

Use this page to inspect markets or price a proposed trade without submitting it. For a complete trade, [swap](swap.md) keeps its own discovery, quoting, execution, and claim instructions.

Discovery answers which pools and assets are available. A quote prices a particular direction and amount; it can use several pools. Listing every pool is not a prerequisite for asking for a route.

These recipes reuse the selected account/network and [authenticated session](configure-shield-swap.md). They do not request funding, reserve input records, or submit a swap. Authentication may still involve an account signature. The examples use **1.5 USDCx → ETH on testnet with 50 bps (0.5%) slippage**; replace those values with the requested terms.

## CLI — discovery and plan-only quoting

Assume `shield-swap` is installed and run from the existing trading directory:

```sh
shield-swap pools --network testnet --token USDCx --limit 50 --json
```

Inspect token IDs/decimals, pool keys, `tradeable`, active `liquidity`, and any reason the pool is unavailable. The command checks on-chain controls and active liquidity; an API listing alone does not establish tradability.

The inspected command fetches a bounded pool list **before** applying `--token`. An empty filtered result does not prove that no such pool exists; widen `--limit` or inspect API pagination. A successful check is a snapshot, not a guarantee at execution time.

For a quote without submission:

```sh
shield-swap swap --network testnet --from USDCx --to ETH --amount 1.5 --slippage 50 --json
```

Leave off `--execute` and check `submitted: false`. This CLI currently checks private holdings even for planning. If the account is unfunded, use the Veil quote below through the [same CLI session](../toolchains/cli.md#reuse-a-cli-account-from-a-script); do not request an airdrop just to quote.

The CLI does not retain this quote for a later invocation. A subsequent execution command obtains fresh terms. Exact quote approval requires the SDK path with the retained native quote.

## Veil — discover pools

Use the `authenticate.mts` from [configuration](configure-shield-swap.md). Save as `discover-pools.mts` and run `npx tsx discover-pools.mts`:

```ts
import { client } from './authenticate.mts'

const token = await client.tokenData('USDCx')
const page = await client.api.getPools({ limit: 50, offset: 0 })
const pools = page.data.filter(pool =>
  pool.token0 === token.id || pool.token1 === token.id,
)
console.log({
  token: { id: token.id, symbol: token.symbol, decimals: token.decimals },
  pools: pools.map(pool => ({
    poolKey: pool.key, token0: pool.token0, token1: pool.token1,
  })),
  pagination: page.pagination,
})
```

This inspects one API page, not the entire pool universe. Follow its pagination when completeness matters. Resolve the other token's metadata with `client.tokenData(id)`; do not guess decimals from its symbol.

For a selected pool, `client.getTradeControls({ poolKey })` reads current gates and `client.getSlot({ poolKey })` reads active liquidity. Both matter when assessing tradability; neither proves that an arbitrary trade size will fill at the desired price.

## Veil — quote without funding

Save as `get-quote.mts` and run `npx tsx get-quote.mts`:

```ts
import { formatUnits } from '@provablehq/shield-swap-sdk'
import { client } from './authenticate.mts'

const quote = await client.quote({
  from: 'USDCx', to: 'ETH', amountIn: '1.5', slippageBps: 50,
})
console.log({
  network: quote.network,
  inputToken: quote.from.id, outputToken: quote.to.id,
  amountIn: formatUnits(quote.amountIn, quote.from.decimals),
  expectedOut: formatUnits(quote.expectedOut, quote.to.decimals),
  minimumOut: formatUnits(quote.minOut, quote.to.decimals),
  route: quote.hops.map(hop => ({
    poolKey: hop.poolKey, tokenIn: hop.tokenInId, tokenOut: hop.tokenOutId,
  })),
  expiresAt: new Date(quote.expiresAt).toISOString(),
})
```

The decimal input is in token units; the native quote's amounts are base-unit `bigint` values. This fetches token metadata and an indexed route without a balance check, proving, or submission. Its 60-second preparation expiry is based on local request time, not a guarantee that the indexer's pool state is fresh.

## Python — discover pools

Use the `authenticate.py` from [configuration](configure-shield-swap.md). Save as `discover_pools.py` and run `python discover_pools.py`:

```python
from authenticate import dex

token = dex.api.get_token("USDCx")
pools = dex.api.get_pools()
print({"token_id": token.address, "symbol": token.symbol, "decimals": token.decimals})
for pool in pools:
    if token.address not in (pool.token0, pool.token1):
        continue
    print({"pool_key": pool.key, "token0": pool.token0, "token1": pool.token1,
           "symbol0": pool.token0_info.symbol if pool.token0_info else None,
           "symbol1": pool.token1_info.symbol if pool.token1_info else None})
```

Pool token metadata is optional. The inspected helper reads the API's default pool response without exposing pagination arguments; do not label that response an exhaustive search. A listed pool still needs current liquidity and trading-control checks before execution.

## Python — quote without funding

Save as `get_quote.py` and run `python get_quote.py`:

```python
from authenticate import dex

quote = dex.quote(
    token_in="USDCx", token_out="ETH", amount_in="1.5", slippage_bps=50,
)
print({
    "network": quote.network,
    "input_token": quote.token_in_id, "output_token": quote.token_out_id,
    "amount_in": quote.amount_in,
    "expected_out": quote.estimated_amount_out,
    "minimum_out": quote.minimum_amount_out,
    "route": [hop.pool_key for hop in quote.hops],
})
```

Python's quote amounts are token-unit decimal strings, not Veil's raw `bigint` fields. The inspected quote has no `expiresAt` field. Record when it was obtained, refresh delayed quotes, and recheck terms rather than assuming identical freshness enforcement across SDKs.

## Read market trades

Pool activity can inform market inspection but is not the account's private [swap history](swap-history.md). A trade feed is also not an executable quote.

Resolve a pool key through discovery, then set `SHIELD_SWAP_POOL_KEY`.

Veil — save as `pool-trades.mts`, run `npx tsx pool-trades.mts`:

```ts
import { client } from './authenticate.mts'

const poolKey = process.env.SHIELD_SWAP_POOL_KEY
if (!poolKey) throw new Error('Supply a discovered pool key')
const trades = await client.api.getPoolTrades(poolKey, { limit: 50, offset: 0 })
console.log(JSON.stringify(trades))
```

Python — save as `pool_trades.py`, run `python pool_trades.py`:

```python
import os
from authenticate import dex

trades = dex.api.get_pool_trades(
    os.environ["SHIELD_SWAP_POOL_KEY"], limit=50, offset=0,
)
print(trades)
```

Both calls read paginated, pool-wide activity. Follow the installed response schema and account for new entries arriving while offsets advance. The CLI's `history` command serves personal swap history, not this feed.

## Return the quote, then stop

Report the network, exact input/output token IDs, requested amount, route, expected output, minimum output, and available freshness information. Keep amount units explicit; a quote is neither a liquidity reservation nor proof of spendable balance.

If the request was discovery or quoting, stop here. A new request to execute continues through [swap](swap.md), preserving the SDK quote and the user's bounds. Do not add a trade, funding request, or wider slippage to make an unsuccessful quote work.

An MCP consumer follows the same boundary using its actual discovery/quote tools. See [MCP](../toolchains/mcp.md); do not assume SDK methods automatically exist in the connected tool catalog.
