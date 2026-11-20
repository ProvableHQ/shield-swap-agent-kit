# Check source balances

Use [dependencies](dependencies.md) if the bridge SDK is missing. Copy [source-balances.mjs](../scripts/source-balances.mjs) into the application. Replace `EVM_ADDRESS` with the supplied public address:

```sh
node source-balances.mjs EVM_ADDRESS
```

This performs public RPC reads on Base, Ethereum mainnet, Arbitrum, and Arc. It loads the installed bridge registry for token contracts and decimals. It never loads a signer, requests an approval, or registers an account. Optional `BASE_RPC_URL`, `ETHEREUM_RPC_URL`, `ARBITRUM_RPC_URL`, and `ARC_RPC_URL` select existing application endpoints. Do not print credential-bearing RPC URLs.

The result contains one network entry with `chain`, `chainId`, `status`, and `assets`. Each checked amount has a base-unit string `raw`, a decimal string `amount`, and the applicable catalog route IDs. Zero is a successful balance read. `unavailable` means the RPC, network identity, token metadata, or contract read could not be verified. Keep successful amounts when another read fails.

Present a compact table with **Network**, **Asset**, **Balance**, and **Path to Aleo**, or a separate short list per network in a narrow terminal. Never add balances across networks. On Arc, the six-decimal ERC-20 USDC interface and eighteen-decimal native gas interface represent the same funds; the helper displays the ERC-20 balance once and marks `alsoPaysGas`.

An active registry route describes supported deployments, not current availability. Run live route and fee checks before offering an executable transfer. Missing or paused routes are not a reason to send funds to a guessed contract.

## Solana after it is selected

Use the selected public RPC and check that it serves Solana mainnet. Resolve SOL and SPL token mint addresses from `DEFAULT_BRIDGE_REGISTRY.getAssets({ environment: 'mainnet', chainId: 'solana' })`. Use the bridge client's `publicClient.getBalance(address)` for SOL in lamports. For token holdings, read `getTokenAccountsByOwner` filtered by the registry mint with `encoding: 'jsonParsed'`, sum exact `tokenAmount.amount` integers, and verify `tokenAmount.decimals` matches the registry. Include both classic SPL Token and Token-2022 accounts where applicable; USDG uses Token-2022.

Show SOL for fees separately from the selected token. Unavailable RPC reads remain unknown. Solana addresses are case-sensitive; do not lowercase them or treat an EVM address as a Solana account.
