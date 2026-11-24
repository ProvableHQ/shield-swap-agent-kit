# Discover assets, inspect holdings, and quote a trade

Use the selected account's network throughout. An Aleo address alone does not select mainnet or testnet. Assets with the same symbol on different networks are different assets.

## Discover the tradable pair

Start with the configured SDK client's token registry and pool list. The copied [Python workflow](../assets/python/workflow.py) exposes `discover(venue)`; the [TypeScript workflow](../assets/typescript/workflow.mts) exposes `discover(client)`. Both return token IDs, decimal counts, AMM programs, record programs, and pool keys without signing or opening another session.

Python, using the configured `venue` from the [Python recipe](python.md):

```python
from workflow import discover

def list_markets(venue):
    return discover(venue)
```

TypeScript, using an existing `WalletClient & ShieldSwapActions`:

```typescript
import { discover } from './workflow.mjs'
import type { WalletClient } from '@provablehq/veil-core'
import type { ShieldSwapActions } from '@provablehq/shield-swap-sdk'

export async function listMarkets(client: WalletClient & ShieldSwapActions) {
  return discover(client)
}
```

Use the raw registry's `address` field for the on-chain token ID (`...field`), not its database `id`. Veil's normalized `tokenData(...).id` already contains that on-chain address, and the bundled discovery helpers normalize it too. Python's `api.get_token` accepts an exact symbol only; the supplied inventory adapter resolves either an on-chain address or an unambiguous symbol. Persist verified on-chain IDs in strategy configuration.

If a symbol is ambiguous, ask which asset is intended. A pool entry does not prove that it is enabled, has sufficient liquidity, or can execute at a displayed price. A missing direct pool does not rule out a multi-hop route: ask the SDK for a quote. The listed pools are the returned page, not an exhaustive market scan; follow API pagination when exploring the full market.

The AMM token program identifies the asset traded by the pool. `underlying_program` / `underlyingProgram`, falling back to the AMM program for a plain token, identifies the records that fund it. Do not infer this relationship from a ticker. For a nonstandard or multi-token record interface, verify SDK support before using the generic program-based inventory planner.

## Inspect funds and spendable records

Python: `venue.dex.get_balances(include_private=True)` reads public and confidential holdings for the bound account. `include_private=False` reads public holdings before scanner setup. TypeScript: `client.getBalances({ tokens: [INPUT_ID, OUTPUT_ID] })` returns base-unit `public`, `private`, and `total` values with decimals. Supply IDs from discovery; these reads do not authorize spending.

Use `inventory_summary(venue, INPUT_ID)` or `inventorySummary(client, INPUT_ID)` for available record amounts and reserved counts. These helpers omit record plaintext. A total of 10 tokens across two 5-token records cannot fund an 8-token swap without preparation. One 10-token record cannot fund two concurrent 4-token swaps.

If scanning fails, report that confidential holdings are unavailable and identify the cause. Do not report zero or substitute public holdings for the trading balance. Read [record inventory](concurrency.md) for fragmentation and concurrent work.

## Request and review a quote

Python, on an existing configured `venue`:

```python
def preview_trade(venue, input_id, output_id, amount, slippage_bps, max_age):
    # amount is decimal text, for example '0.001', never a float.
    offer = venue.quote(input_id, output_id, amount,
                        slippage_bps=slippage_bps, max_age=max_age)
    q = offer.native
    summary = {'network': q['network'], 'input': q['amount_in'],
               'expected_output': q['estimated_amount_out'],
               'minimum_output': q['minimum_amount_out'],
               'route': [hop['pool_key'] for hop in q['hops']]}
    return offer, summary
```

TypeScript, on the local `ShieldVenue` adapter:

```typescript
import { formatUnits } from '@provablehq/shield-swap-sdk'
import type { ShieldVenue } from './shield.mjs'

export async function previewTrade(venue: ShieldVenue, input: string, output: string,
  amount: string, slippageBps: number, maxAgeMs: number) {
  const offer = await venue.quote(input, output, amount, slippageBps, maxAgeMs)
  const q = offer.native
  return { offer, summary: { network: q.network,
    input: formatUnits(q.amountIn, q.from.decimals),
    expectedOutput: formatUnits(q.expectedOut, q.to.decimals),
    minimumOutput: formatUnits(q.minOut, q.to.decimals),
    route: q.hops.map(hop => hop.poolKey), expiresAt: q.expiresAt } }
}
```

The caller supplies IDs, decimal input amount, slippage in basis points, and a positive maximum age (Python seconds up to 60; TypeScript milliseconds up to 60,000, further bounded by native expiry). Example amounts are not spending policies. Keep the returned `offer` unchanged for the authorized submission.

Review the pair, network, input, minimum output, route, and fees. Use the minimum output to check a strategy's permitted worst case. No route, paused/disabled pools, an invalid amount, or insufficient liquidity means this candidate cannot proceed. Do not increase slippage, switch networks, or substitute an asset to make it execute.

The preview does not reserve inventory. Recheck readiness before writing and let the SDK acquire records atomically. After submission begins, monitor the original request even after its quote expires.
