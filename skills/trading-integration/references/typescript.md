# TypeScript and JavaScript integration

Copy the [TypeScript/JavaScript reference package](../assets/typescript/package.json) and its neighboring files into the consumer project. The core `.mjs` modules run in JavaScript and expose TypeScript declarations. [shield.mts](../assets/typescript/shield.mts) binds them to Veil. Node 22.13 or newer is required for the SQLite adapter.

Install published dependencies in the project:

```sh
npm install @provablehq/shield-swap-sdk@latest @provablehq/veil-core@latest @provablehq/veil-aleo-sdk@latest
npm install --save-dev typescript@latest tsx@latest @types/node@latest
```

Retain the existing signer and clients. When starting a local signing client, `openSession` accepts the selected private key in memory, the expected address, network, and existing state root. Obtain that key through the project's account loader; never put it in a command argument or source file. The helper checks the address before API authentication. It creates no account and performs no scanner registration, funding, or trade.

To integrate an existing local signing client, configure `recordManagement` with `enabled: true`, `chainId`, and [InventoryStore](../assets/typescript/inventory.mjs), and configure `shieldSwapActions` with `swapFileStore`. Then construct `ShieldVenue(client, address, network)`. Reuse those stores for every writer. The adapter checks the local account, network, and durable record configuration before writing. A browser-wallet adapter must separately confirm claims before returning a completed result.

Once `venue` is the configured adapter, the application can use:

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

After authorization, construct `Trading(venue, statePath, { maxInFlight, executionEnabled: true })`. Call `execute(id, offer)` for one request or `executeMany([[id, offer], ...])` for independent requests. `submitted` means the output still needs its claim. `complete` includes `amountOut` and `amountRemaining` in base-unit `bigint` values. Unknown outcomes remain on their original request IDs.

Run `npm test` and `npm run check` from the copied package. Compile the `.mts` adapter for a JavaScript application, or load it through the project's existing TypeScript build. Do not introduce a separate CLI merely to run these functions.
