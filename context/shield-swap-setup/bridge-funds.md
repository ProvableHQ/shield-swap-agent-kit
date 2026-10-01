# Fund the account

Check the intended account and network's existing holdings first, including private records. If it already has the funds required by the requested task, no transfer is needed. Configuration alone does not authorize a bridge transaction or funding request.

Choose the funding path from the user's actual source assets:

- **Testnet tokens:** use the selected SDK's documented testnet faucet workflow when requested. Check an existing airdrop job and scanner progress before requesting another batch.
- **Assets already on Aleo:** use the documented wallet or token transfer flow for that network and asset.
- **Assets on another chain:** select a supported bridge route for the source chain, destination network, token, amount, and recipient. Use the bridge SDK's installed guide and checkpoint/recovery flow.

The [Veil bridge guide](https://github.com/ProvableHQ/veil/blob/main/packages/bridge/skills/SKILL.md) points to packaged examples. The inspected examples target mainnet; they are not testnet funding scripts. Verify route support and fees for the selected SDK version before execution. This kit does not yet supply a bridge script.

Keep bridge recovery checkpoints and any required private material in protected persistent storage. After an uncertain submission, inspect or recover the original transfer instead of sending it again. Confirm that the destination funds have arrived and are spendable; a transfer receipt and scanner visibility can occur at different times.

Return to the user's requested task once funding is complete. If that task is a swap, continue with [swap](swap.md). Funding does not select a strategy or authorize a new trade.
