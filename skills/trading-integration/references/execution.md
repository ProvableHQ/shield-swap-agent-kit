# Build the complete trade lifecycle

A swap spends an input record and leaves an output to claim. A separate claim delivers the output and any unused input to the account. Retain enough state to finish that claim after the process or browser closes. The returned SDK handle contains claim material; store it privately and never print it in chat or ordinary logs.

## Follow one trade

| Stage | What happens | What the application retains or displays |
| --- | --- | --- |
| Discover | Read token metadata and available pools on the selected network. | Exact token IDs, decimals, and funding record programs. |
| Check readiness | Read holdings and available records. Confirm API access, scanner access, and the fee path. | A covering unreserved input record and funds for account-paid fees. |
| Quote | Ask the SDK for a route and output bound. No trade is submitted. | The complete native quote, its age, and the caller's authorized limits. |
| Submit | The SDK prepares identities and records, proves, and sends the request. | One application request ID and durable SDK state, followed by the returned handle. |
| Await output | The request finalizes and the on-chain output becomes readable. | Pending progress on the original request. A timeout does not create a new trade. |
| Claim | The SDK reads the actual output and requests its transfer to the account. | The claim transaction ID and actual output/refund amounts. |
| Verify | Confirm the claim and allow the scanner or wallet to observe its records. | Completed execution and spendable inventory, reported separately if the scan lags. |

Use [the market guide](markets.md) for discovery and quotes, [fees](fees.md) before writes, and [recovery](recovery.md) when saved progress disagrees with an observed result.

## Preserve the approved quote

Keep the native quote through submission: its route, input, minimum output, network, and protocol revision. If it expires before submission, obtain a fresh quote and validate it against existing authority. Ask again only when new terms exceed that authority.

The wrapper's age limit measures local elapsed time. It does not establish API indexer freshness. Veil also supplies `quotedAt` and `expiresAt`; the Python reference adds an age limit because its quote has no equivalent expiry field. The transaction's block deadline is a separate constraint. Quote expiry does not cancel proving or a broadcast already started.

Let `swap` consume the native quote and choose single- or multi-hop execution. Do not rebuild the route from displayed symbols or replace it with a single pool. Advanced direct contract calls require their own verified ABI and proof configuration; the bundled integration uses SDK actions.

## Interpret completion and refunds

The SDK returns actual output and `amount_remaining` / `amountRemaining`, the unspent original input. A nonzero refund means the whole input did not trade. Zero output with a refund is a refund-only outcome, even if both transactions were accepted. A strategy must use actual filled quantities before its next trade.

For multi-hop swaps, unused original input can be refunded. Later hops must consume their intermediate input; do not build a recovery trade from an assumed intermediate-token balance. Retain the route-specific handle and use the same claim action.

Wrapped AMM assets can use underlying token records for funding and return underlying records when claimed. Resolve that relationship from metadata. Do not add a manual unwrap or a public transfer merely because the DEX token ID differs from the record program. Public holdings do not establish spendable confidential holdings.

## Use the application workflow

The bundled workflow exposes:

| Operation | Behavior |
| --- | --- |
| Venue `quote` | Return the native SDK quote with a local age limit. Reads only. |
| `submit` | Persist the request ID, then call the SDK once. |
| `claim` | Check a known submitted handle, then make its first claim attempt. |
| `execute` | Submit and claim if the output is already available. Otherwise return `submitted`. |
| `execute_many` / `executeMany` | Run different requests with bounded concurrency and retain each outcome. |
| `status` | Read local progress. It does not poll the chain, sign, or repair state. |

Call `claim` again while an operation is `submitted` to check whether its output is ready. Once a claim has begun, an exception leaves `claim_unknown`; repeating the call does not submit another claim. `complete` means the adapter returned a confirmed claim, and includes the actual output and input refund. A refund is not a full fill.

Use an existing event/order ID as the request ID. Reusing it with different quote terms fails. Repeating the same ID after completion returns the original result. Do not generate a fresh ID to recover a timeout.

The application database binds the request to the account, network, and native quote. The SDK reservation store retains record ownership and prepared transactions. Its identity journal retains swap identities. All three must survive restarts and stay associated with the same account. The application checkpoint does not replace either SDK store.

## Keep units attached to amounts

| Value | Python | TypeScript/JavaScript |
| --- | --- | --- |
| Quote request input | Decimal string in input-token units | Decimal string in input-token units |
| Native quote amounts | Decimal strings plus decimal counts | Base-unit `bigint` values plus token metadata |
| Inventory | Base-unit integers | Base-unit `bigint` values |
| Claim result | Base units, stored by this adapter as integer strings | Base-unit `bigint` values |
| Network fee | Integer microcredits, 1 ALEO = 1,000,000 microcredits | `bigint` microcredits |
| Slippage | Integer basis points, 50 = 0.5% | Integer basis points |

Use decimal text, integer arithmetic, and declared token decimals. Do not convert financial amounts through floating-point numbers. Refunds use input-token decimals; outputs use output-token decimals.

## Keep service access explicit

Keep inspection, authentication, and execution distinct. Opening a signing session authenticates with the API. Scanner registration shares a view key and belongs to account setup. Neither action should happen as a hidden side effect of displaying a quote.

Account addresses and balances remain confidential on the public ledger. The pair, route, amounts, prices, timing, and swap-to-claim link remain observable. The wallet, scanner, prover, and API also have their own visibility. Do not describe this integration as hiding trade terms from every participant.
