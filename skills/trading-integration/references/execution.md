# Trading functions and their boundaries

A swap submits a request and later claims its output. Keep both steps under one application request ID. The returned SDK handle contains claim material; store it privately and never print it in chat or ordinary logs.

The bundled workflow exposes:

| Operation | Behavior |
| --- | --- |
| Venue `quote` | Return the native SDK quote with a local age limit. Reads only. |
| `submit` | Persist the request ID, then call the SDK once. |
| `claim` | Check a known submitted handle, then make its first claim attempt. |
| `execute` | Submit and claim if the output is already available. Otherwise return `submitted`. |
| `execute_many` / `executeMany` | Run different requests with bounded concurrency and retain each outcome. |
| `status` | Read saved application progress without signing or retrying. |

Call `claim` again while an operation is `submitted` to check whether its output is ready. Once a claim has begun, an exception leaves `claim_unknown`; repeating the call does not submit another claim. `complete` means the adapter returned a confirmed claim, and includes the actual output and input refund. A refund is not a full fill.

Use an existing event/order ID as the request ID. Reusing it with different quote terms fails. Repeating the same ID after completion returns the original result. Do not generate a fresh ID to recover a timeout.

The application database binds the request to the account, network, and native quote. The SDK reservation store retains record ownership and prepared transactions. Its identity journal retains swap identities. All three must survive restarts and stay associated with the same account. The application checkpoint does not replace either SDK store.

Amounts retain their native SDK representation. Python quote inputs are decimal strings; TypeScript quotes carry base-unit `bigint` amounts. Python claim results are normalized to integer strings for storage; JavaScript preserves `bigint`. Never pass human decimal amounts where base units are expected or convert financial amounts through floating-point numbers.

Keep inspection, authentication, and execution distinct. Opening a signing session authenticates with the API. Scanner registration shares a view key and belongs to account setup. Neither action should happen as a hidden side effect of displaying a quote.

Shield Swap keeps account addresses and balances confidential on the public ledger. Trade terms and timing remain observable. The selected scanner, prover, wallet, and API have their own visibility; these modules do not change those service boundaries.
