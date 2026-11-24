# Add trading to a connected-wallet application

Use [browser-trading.ts](../assets/browser/browser-trading.ts) with the application's existing connected Veil wallet client. It exposes preview, submit, progress, and claim functions, with browser persistence across refresh. Keep wallet connection and transaction approval in the application's existing UI.

Copy the [browser package](../assets/browser/package.json), its module, and tests into the consumer project, or adapt them to its build. Install current packages:

```sh
npm install @provablehq/veil-core@latest @provablehq/shield-swap-sdk@latest
npm install --save-dev typescript@latest tsx@latest @types/node@latest
```

The Node SQLite modules and local `ShieldVenue` adapter are not frontend dependencies. This browser example stores wallet-derived public handles, never a private key, view key, or blinding factor.

## Retain the wallet and configure its permissions

The connected client's account type is `rpc`. It needs the chosen network, the wallet's existing signing callbacks, and a transport that routes wallet requests and chain reads. `executeTransaction` and `transactionStatus` go to the wallet; mappings, program source, and confirmed-transaction reads need the application's chain transport. Do not replace a timed-out wallet call with another broadcaster.

At the existing connection/permission screen, merge the native Shield Swap algorithm grants. This prepares blinding and exclusion-proof permissions at the SDK's exact call sites. The wallet must implement these algorithms; constructing grant objects does not grant access or add capabilities.

```typescript
import type { ConnectOptions } from '@provablehq/veil-core'
import { shieldSwapAlgorithmGrants } from '@provablehq/shield-swap-sdk'

export function tradingPermissions(existing: ConnectOptions): ConnectOptions {
  return { ...existing, algorithmsAllowed: [
    ...(existing.algorithmsAllowed ?? []), ...shieldSwapAlgorithmGrants(),
  ] }
}
```

Apply the returned options through the existing wallet connection flow. The example uses the SDK's default deployments. For a custom deployment, verify grants, client program configuration, and per-call router/freezelist overrides together, then extend and test the adapter. An arbitrary top-level option does not configure every call. Keep an already selected wallet and account.

## Ask the wallet for the correct input record

The wallet path requires a `record` input request; the SDK cannot infer the wallet's record shape. Resolve the underlying funding program and inspect its deployed record fields. A verified plain ARC token can use its `Token` record and `amount` field only when that is its actual ABI. Wrapped ALEO instead consumes underlying `credits.aleo` records:

```typescript
import type { InputRequest } from '@provablehq/veil-core'

export function aleoRecord(amountInMicrocredits: bigint): Extract<InputRequest, { type: 'record' }> {
  return { type: 'record', program: 'credits.aleo', recordname: 'credits',
    filters: { microcredits: { gte: `${amountInMicrocredits}u64` } } }
}
```

For an ARC record, use its verified program, record name, balance field, and integer width, for example an `amount` filter with `u128`. A pinned wallet record UID is an alternative to filters; do not supply both. Request corresponding program/field permissions if the app reads record UIDs or balances.

The wallet owns its derived identities and record selection. The app journal does not replace that wallet state. Configure one outstanding operation unless the selected wallet's independent-record concurrency is established. Local SDK identity stores are ignored for wallet-derived identities.

## Bind callable functions to UI actions

Create the integration after connection, with the current wallet client, expected address/network, and approved policy. This typed factory leaves those application-owned inputs explicit:

```typescript
import { createBrowserTrading } from './browser-trading.ts'

export function bindTrading(options: Parameters<typeof createBrowserTrading>[0]) {
  return createBrowserTrading(options)
}
```

| Option | Source and meaning |
| --- | --- |
| `connectedClient` | The existing connected Veil wallet client. |
| `currentClient` | Function returning the current client, or `undefined` after disconnect. Update it immediately on wallet changes. |
| `address`, `network` | Verified selected account and network. Recreate the binding after either changes. |
| `policy.maxInFlight` | Maximum outstanding app operations; choose from the verified wallet capability. |
| `policy.maxInputByToken` | Maximum input per trade, keyed by verified token ID, as base-unit `bigint`. |
| `policy.allowedOutputs` | Permitted output token IDs. |
| `policy.maxSlippageBps` | Maximum allowed integer slippage in basis points. |
| `recordForQuote` | App function mapping quote metadata and base-unit input to a verified wallet record request. |
| `executionEnabled` | Explicit write enablement, false when omitted. Wallet approval remains required. |
| `sdk` | Optional native Shield Swap deployment/API configuration. |

These are per-trade controls. Add total-spend and strategy budgets in the application's existing policy service. Transaction fee approval belongs to the wallet; this interface does not enforce a browser fee ceiling.

Use `listProgress()` after connection or refresh to restore the selected account's saved operations. It reads local state without signing or polling. Use separate event handlers for each action:

1. `preview({ from, to, amountIn, slippageBps })` returns an offer. `amountIn` is human decimal text; its returned quote uses base units. Show input, minimum output, route, and expiry for review.
2. `submit(existingOrderId, offer)` requests wallet approval and saves progress. Retain the exact offer and stable order ID.
3. `checkProgress(existingOrderId)` reads wallet/chain progress and updates the local checkpoint. Schedule bounded polling; it does not request a new trade or claim.
4. When status is `ready`, display `output.amountOut` and `output.amountRemaining` with the output and input token's respective decimals. `claim(existingOrderId)` requests the separate wallet claim approval.
5. Continue read-only progress checks until the claim is confirmed. Then refresh wallet holdings before spending its records again.

`authenticate()` is a separate login action that can ask the wallet to sign an API challenge. The example disables automatic reauthentication during preview. Expired access surfaces to the UI rather than opening a signing prompt inside a quote. Browser cookies require working credentialed CORS and session settings for the application's actual origin.

## Handle refresh and wallet confirmation

Wallet requests can return an opaque request ID before a chain transaction exists. A wallet swap handle can also lack `swapId` and `blindedAddress`. `checkProgress` resolves the request ID, reads its accepted transaction, matches the core swap transition to saved terms, and reads the output mapping to complete the handle. Wrapped and multi-hop routes include the core transition inside the router transaction.

| Status | UI behavior |
| --- | --- |
| `submitted` | Show the original request as pending and check progress. |
| `ready` | Show the output/refund and offer the claim action. |
| `claim_submitted` | Show claim pending. Wallet acceptance of the request is not chain confirmation. |
| `complete` | The matching claim transaction was accepted. Refresh holdings separately. |
| `rejected` | The original swap was rejected on chain. Show that result and any charged fee. |
| `submitting`, `submission_unknown`, `claiming`, `claim_unknown` | Preserve the original state for investigation; do not submit replacements. |

Only a confirmed transaction HTTP 404 remains pending without an error. Other transport failures surface to the UI. An absent output mapping does not prove a claim succeeded. The claim confirmation check matches swap identity, assets, and actual output/refund amounts before marking completion.

The example uses localStorage and Web Locks scoped to account/network. All app tabs must use the same origin, storage, and lock name. Missing storage or locks blocks writes. Site-data clearing, private browsing, another browser, or another device does not preserve this journal. Keep it on the trusted app origin; it contains account trade history even though it contains no wallet secrets.

If saving fails after dispatch, `CheckpointWriteError.checkpoint` contains the returned handle or claim receipt. Preserve it in an explicit recovery/export path and restore storage. The saved intent remains blocked after refresh; never submit again to obtain a replacement response.

If the wallet's response itself is lost before a request ID is known, this SDK interface cannot automatically correlate the app order with wallet history. Inspect the original wallet's activity and confirmed chain transaction before repairing the checkpoint. Do not guess from similar amounts. An unclassified wallet rejection also preserves uncertainty; add a provider-specific pre-dispatch cancellation classifier only when that provider guarantees no submission occurred. See [recovery](recovery.md) for evidence and repair boundaries.

## Test the actual integration

Run `npm test` and `npm run check` from the copied browser package. Its tests call the native SDK through mocked wallet, API, and chain transports, with ABI-derived transaction fixtures for single-hop, multi-hop, wrapped assets, and refunds. Add tests for the application's connection and event handlers.

The offline tests do not establish real wallet permissions, browser storage behavior, CORS, or funded execution. Verify those with the selected wallet before enabling live use; retain its existing account and project throughout.
