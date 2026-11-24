# Keep a TypeScript application native

Use the TypeScript/JavaScript modules in `trading-integration` for the Shield leg. Retain the application's EVM signer and client. The maintained end-to-end arbitrage reference is Python; use its execution contract when implementing the application's TypeScript strategy, and validate that implementation independently.

With viem, quote a configured Uniswap v3 pool using `publicClient.simulateContract` against QuoterV2's `quoteExactOutputSingle`. The input is the quote token, the output is the base token, and `amount` is the same human base quantity sold on Shield, converted to the EVM token's decimals. Use `bigint` throughout.

The original SwapRouter's `exactOutputSingle` tuple contains `tokenIn`, `tokenOut`, `fee`, `recipient`, `deadline`, `amountOut`, `amountInMaximum`, and `sqrtPriceLimitX96`. Verify the configured deployment against the [official router interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/ISwapRouter.sol). Router02 omits the deadline from this tuple. Universal Router uses commands and Permit2. Each needs its own integration, so preserve the existing application's supported choice.

Derive and persist the signed transaction hash before `sendRawTransaction`, and retain the exact request after a lost response. Keep allowance setup outside the execution window. After a successful receipt, retain the configured confirmation requirement. A connected wallet's opaque submission requires its own durable request/recovery support; do not silently switch to a local key.

Keep the same strategy boundaries as the Python reference: confirmed asset correspondence, comparable sizes, conservative cost bounds, available inventory at both venues, stable cycle IDs, and explicit unmatched exposure. Test the native implementation before declaring parity.
