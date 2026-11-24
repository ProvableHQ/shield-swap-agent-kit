# Receive funds without a mainnet bridge

## Aleo testnet faucet

Keep the Aleo address passed by account setup, or ask for the receiving public address. Confirm **testnet**. Offer the [official Aleo faucet](https://faucet.aleo.org), listed by the [Aleo Network Foundation](https://aleo.org/ecosystems/aleo-faucet/), and provide the address to paste there. Read the current faucet instructions; do not invent an API or a fixed grant amount.

The person completes any wallet sign-in or human-verification step. If an available browser can assist, stop at a step requiring their input and continue afterward. Keep the faucet's request or transaction identifier. On a delay or rate limit, inspect that request instead of submitting repeatedly.

Testnet ALEO pays network fees and is for practice. It is distinct from Shield Swap test assets such as testnet USDCx. Do not silently replace the Aleo faucet with the CLI's combined setup or a Shield Swap airdrop.

Verify the destination's testnet ALEO balance through its existing wallet or a public node. For public ALEO, read `credits.aleo` mapping `account` at `https://edge.provable.com/api/v2/testnet/program/credits.aleo/mapping/account/ALEO_ADDRESS`, replacing `ALEO_ADDRESS` with the recipient. Amounts are `u64` microcredits, with six decimals. A successful null entry means no public balance; HTTP errors are unavailable, not zero. Private receipts require the chosen wallet's record access. Compare with the balance before the request and retain transaction evidence.

Report whether funds arrived and whether the existing application can use them. Return to the selected testnet task. If that task needs another asset, offer the separate test-asset funding step by name and inspect its current SDK capability before requesting it. A faucet request does not authorize a trade.

## Receive assets already on Aleo

Show the selected Aleo address, network, and intended asset. Someone can send from another Aleo wallet or withdraw from a service that supports that exact asset and Aleo network. Check the service's actual withdrawal options before suggesting it; a ticker match on another chain is insufficient.

The sending wallet retains its own signing flow. If the agent is asked to send from an available wallet, review the asset, amount, recipient, mode, and fee before using the authorized transfer capability. Receiving does not require exporting the destination private key.

Record the transaction identifier and wait for acceptance. Public and confidential receipt are different outcomes. Reuse the receiving setup's wallet/scanner to confirm confidential holdings when permitted; without record access, report the limit of what was verified. Offer a public-to-private conversion only when the asset supports it and Aleo fees are available.

For supported bridge assets already held publicly by the receiving account, `bridge.shield` can perform that conversion using the selected Aleo signer, as described in [finish delivery](bridge-transfer.md#verify-delivery-and-confidential-holdings). It is an Aleo transaction with a fee, not another bridge deposit.
