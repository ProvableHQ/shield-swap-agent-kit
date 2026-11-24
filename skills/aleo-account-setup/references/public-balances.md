# Check public holdings first

Read balances for the verified public address on both networks before asking someone to choose a trading language. Do not unlock an account or sign in for this check.

Use the bundled [public balance checker](../scripts/public-balances.mjs) with Node.js 22 or newer when available. Replace `SKILL_DIR` with this installed skill's absolute directory and `ALEO_ADDRESS` with the verified public address:

```sh
node "SKILL_DIR/scripts/public-balances.mjs" ALEO_ADDRESS
```

The helper makes only HTTPS GET requests. It reads each network's token registry, matches the eight requested symbols without regard to case, and checks the deployed `balances` mapping for each distinct underlying and wrapper contract. It needs no dependencies, account files, or credentials. It keeps integer precision and includes a timestamp, network, program, raw base units, and decimal amount in its JSON output.

For a listed asset, `amount` is the combined public holding across its distinct underlying and wrapper contracts. `contracts` retains each component. When both registry fields name the same program, it is read once. If any component fails, the combined amount is unknown; show successful component amounts separately rather than hiding them or presenting an incomplete sum as the total.

Show all eight assets in the order BAT, ZEC, USDG, USDCX, ETH, wBTC, USDT, SOL. A compact table with **Asset**, **Mainnet public**, and **Testnet public** columns works; use one line per asset when the display handles lists better. Use exact decimal strings from the result. Keep contract identifiers in diagnostics unless someone asks for them.

| Result | What to show |
| --- | --- |
| `checked` | The decimal amount, including an explicit `0` when the deployed mapping has no entry. |
| `not_listed` | **Not listed** for that network. The registry did not identify this asset; this is not a zero balance or proof that no such contract exists. |
| `ambiguous` or `invalid_metadata` | **Needs verification**. Resolve the intended contract before reporting an amount. |
| `unavailable` or `registry_unavailable` | **Unavailable**. Preserve other successful reads. |

After the results, say: “These are your public balances. We'll check private balances after connecting your trading setup.” Do not infer funding from public zeros.

## When Node is unavailable

Use an available HTTPS client for the same requests; do not select JavaScript as the trading stack just to run this check. The complete procedure is:

1. GET `https://api.swap.shield.fi/tokens` for mainnet and `https://api.testnet.swap.shield.fi/tokens` for testnet. The response's `data` array contains `symbol`, `address` (the token ID), `decimals`, `underlying_program`, and `amm_token_program`.
2. Resolve each requested symbol on that network without regard to case. Keep USDCX distinct from USDC. Missing or duplicate symbols stay unresolved; do not invent program names or copy mainnet identifiers to testnet.
3. For each distinct underlying and wrapper program, GET `https://edge.provable.com/api/v2/NETWORK/program/PROGRAM`. Confirm a `balances` mapping keyed by `address.public` with a `u128.public` value. An unavailable program or a different mapping shape requires investigation.
4. GET `https://edge.provable.com/api/v2/NETWORK/program/PROGRAM/mapping/balances/ALEO_ADDRESS`. A successful JSON `null` is zero. A string such as `1230000u128` is an integer in base units. HTTP errors, including 404, are unknown. Divide using the registry's decimals without floating-point rounding.
5. Keep the network and contract with each result. Sum only distinct, successfully read contracts for the same asset and retain their individual values.

These are public reads. Scanner registration and private balances belong to the next setup step.
