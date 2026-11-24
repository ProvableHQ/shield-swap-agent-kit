# TypeScript and JavaScript integration

Copy the [TypeScript/JavaScript reference package](../assets/typescript/package.json) and its neighboring files into the consumer project. The core `.mjs` modules run in JavaScript and expose TypeScript declarations. [shield.mts](../assets/typescript/shield.mts) binds them to Veil; [workflow.mts](../assets/typescript/workflow.mts) supplies discovery, inventory preparation, and progress examples. Node 22.13 or newer is required for SQLite. For a frontend use [the browser example](browser.md).

Install published dependencies in the project:

```sh
npm install @provablehq/shield-swap-sdk@latest @provablehq/veil-core@latest @provablehq/veil-aleo-sdk@latest
npm install --save-dev typescript@latest tsx@latest @types/node@latest
```

Retain the existing signer and clients. When starting a local signing client, `openSession` accepts the selected private key in memory, the expected address, network, and existing state root. Obtain that key through the project's account loader; never put it in a command argument or source file. The helper checks the address before API authentication. It creates no account and performs no scanner registration, funding, or trade.

To integrate an existing local signing client, retain its enabled `recordManagement`, `chainId`, durable record store, and Shield Swap identity store. For a new client the reference uses [InventoryStore](../assets/typescript/inventory.mjs) and `swapFileStore`. Construct `ShieldVenue(client, address, network)` for that bundled store, or `ShieldVenue(client, address, network, existingDurableStore)` for the application's own implementation of `RecordInventoryStore`. Verify that the supplied store persists and coordinates all writers; the argument does not make an in-memory store durable. The adapter checks the original account, network, enabled configuration, and store identity before writes.

## Open the existing account explicitly

Call the session factory during an explicit connection/startup action. Supply `privateKey` through the existing protected account loader, plus the verified address, selected network, and original state root. The factory signs an API challenge. It is not part of a render or quote-only function.

```typescript
import { openSession } from './shield.mjs'

export async function connectTrading(options: Parameters<typeof openSession>[0]) {
  return openSession(options)
}
```

Keep the returned `client`, `venue`, and `inventory` for the application's lifetime. Close `inventory` on shutdown, after active operations stop. An existing configured client should retain its stores and signer instead of calling this factory again. Configure `api: { autoReauthenticate: false }` when creating its Shield Swap actions if previews must never sign a new authentication challenge. The bundled factory does this. On expired API access, explicitly authenticate again before repeating the read; a 401 is not a zero balance or absent route.

## Preview without submitting

Once `venue` is configured, the application can use:

```typescript
import { Trading } from './trading.mjs'
import type { ShieldVenue } from './shield.mjs'

export async function preview(venue: ShieldVenue, statePath: string) {
  const trading = new Trading(venue, statePath)
  try {
    const offer = await venue.quote('ETH', 'USDCx', '0.001', 50, 20_000)
    return { minimumOutput: offer.native.minOut.toString(), quote: offer }
  } finally {
    trading.close()
  }
}
```

Discover real tokens and pools through the configured client's API before choosing assets. Read balances with `client.getBalances`; use Veil's record inventory to distinguish available records from held ones. The sample quote amount is not a bot's spending policy.

## Submit and continue the same trade

After authorization, keep one `Trading` instance for this account and state path. The following factory returns callable application functions. `submit` writes; `continue` can make the first claim for a known submission. Read [fees](fees.md) before enabling either.

```typescript
import { Trading } from './trading.mjs'
import type { ShieldVenue } from './shield.mjs'
import { continueTrade, progress } from './workflow.mjs'

export function authorizedTrading(venue: ShieldVenue, statePath: string, maxInFlight: number) {
  const trading = new Trading(venue, statePath, { maxInFlight, executionEnabled: true })
  return {
    submit: async (id: string, offer: Awaited<ReturnType<ShieldVenue['quote']>>) =>
      progress(await trading.execute(id, offer)),
    continue: (id: string) => continueTrade(trading, id),
    inspect: (id: string) => {
      const row = trading.status(id)
      return row ? progress(row) : undefined
    },
    close: () => trading.close(),
  }
}
```

Schedule `continue(id)` with bounded attempts and a delay using the application's existing job system. After restart, reopen the same account and stores and continue the saved IDs. `inspect` reads the local checkpoint only. A fresh quote is unnecessary for claiming an already submitted trade.

`submitted` still needs a claim. `complete` includes actual output and input refund in base units; the progress helper converts them to strings for JSON/UI use. Raw operation rows contain sensitive handles. An unknown write needs [recovery](recovery.md), not another timer that retries the write.

Use [inventory and concurrency](concurrency.md) for `executeMany`, record preparation, and shared writers. Do not derive concurrency solely from the account's total balance.

Run `npm test` and `npm run check` from the copied package. Compile the `.mts` adapter for a JavaScript application, or load it through the project's existing TypeScript build. Do not introduce a separate CLI merely to run these functions.
