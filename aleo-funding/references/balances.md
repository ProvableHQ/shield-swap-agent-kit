# Review available funds

Read balances for the selected Aleo recipient and automatically check relevant assets for source addresses already known from the conversation, existing setup, or saved wallet metadata. Present the results and funding-wallet choices together in Step 4. If no source address is known, skip the source checks without asking for one and omit that section. Keep the selected network, language, and project. Reconnect an existing Aleo setup as needed for private reads. Source balances require only public addresses; do not generate a wallet or unlock a source key for them.

## Selected Aleo account

Use the verified recipient and target network from the funding choice. Bridging targets mainnet; a testnet faucet choice retains testnet. Keep the account name and public address visible. Reuse balances just read for this same address and network during setup if no intervening transfer makes them stale; otherwise refresh them.

Use the existing application's public balance reader when available. The following public HTTP recipe also works without an SDK account or signer, using the project's language and HTTP client:

1. Fetch `/tokens` from `https://api.swap.shield.fi` for mainnet or `https://api.testnet.swap.shield.fi` for testnet. The response's `data` array supplies token metadata. Select BAT, ZEC, USDG, USDCX, ETH, wBTC, USDT, and SOL by case-insensitive `symbol`. Require one match, integer `decimals` between 0 and 38, and valid Aleo program IDs in `underlying_program` and `amm_token_program`. Missing entries are not listed on that network; ambiguous or invalid entries are unavailable.
2. For each distinct underlying or wrapper program, fetch `https://edge.provable.com/api/v2/NETWORK/program/PROGRAM`. Confirm its `balances` mapping uses an `address.public` key and `u128.public` value before querying `/mapping/balances/ALEO_ADDRESS` on that URL. Replace `NETWORK`, `PROGRAM`, and `ALEO_ADDRESS` with the selected network, registry program, and verified address; encode path segments.
3. A successful JSON `null` mapping value means zero for that verified mapping. Otherwise require a decimal integer with the `u128` suffix and a value below `2^128`. Keep exact base units and format with the registry decimals; do not convert to floating point. Show underlying and wrapper holdings separately, or total them only when both reads succeed. Deduplicate equal program IDs before reading or adding them.
4. Also check public ALEO for fees at `https://edge.provable.com/api/v2/NETWORK/program/credits.aleo/mapping/account/ALEO_ADDRESS`. It returns `u64` microcredits with six decimals. A successful `null` means zero; require other values to fit `u64`.

Use bounded HTTP timeouts. HTTP failures, malformed responses, and an unverified mapping remain **Unavailable**, never zero. Preserve successful nonzero reads when another read fails, labeling a partial underlying or wrapper amount instead of presenting it as the token's full total.

## Private balances for an existing setup

When a setup exists for the selected account and target network, read its private balances automatically. Use balances just returned by setup if still current; otherwise reopen the same application's client with its saved account, endpoints, record provider, and state directory. Verify the address and network before reading. An expired API session can be authenticated again through that existing setup; it does not require repeating onboarding.

Use the application's existing private-balance reader. For Veil, the configured Shield Swap client exposes `getPrivateBalances({ programs })`. For Python, use `dex.get_private_balances(programs, account=client.default_account)`. Resolve `programs` from the token registry's underlying programs and preserve exact amounts and decimals. For CLI or connected-wallet setups, use their private-balance capability with the same account and network. Keep the selected interface.

Confirm that the existing record provider is synchronized before reporting complete private balances, especially zeros. On Python's native client, `client.records.status()` reports `data.synced`; on Veil, retain the configured provider's wait-for-sync behavior. Keep successful holdings if another asset read fails. Show nonzero private amounts first, labeled **Private balance**, followed by public holdings. Do not add the two into an unlabeled total.

If access is locked, missing, syncing, or unavailable, state the specific reason instead of leaving a configured account at “Not checked.” A saved address alone is not a completed trading setup: if record access has never been configured, say “Private balances need account setup.” Preserve prior scanner authorization; do not register with a new provider or disclose a view key just to fill this section. Never request keys or passwords in chat.

## Saved bridge wallets

Inspect the public wallet manifests in the current project's known funding directories and `~/.aleo/funding-wallets/*/wallet.json`. Also include a wallet directory explicitly passed from setup or earlier in this conversation. Do not search unrelated projects, credential stores, or raw secret files for possible wallets.

The bundled Python and JavaScript helpers write the same manifest: `version: 1`, `service: "shield-swap-funding"`, `family`, `address`, `sourceChain`, `sourceAsset`, `recipient`, `environment`, and `purpose`, alongside a credential reference. Read public metadata only; do not run their `check`, `recover`, or `backup` commands for discovery because those open credentials. Skip symlinks. Validate the manifest, supported network, and address syntax before using the address for public reads. For an older setup, use only its known public metadata fields; do not dump a profile or transaction checkpoint to find an address. Invalid or unreadable metadata means that wallet could not be checked, not that no wallet exists.

Deduplicate EVM addresses case-insensitively and Solana addresses case-sensitively. Keep each wallet's saved recipient and source task attached to it, without assuming the keys are currently accessible. A reservation without a public wallet address is incomplete setup, not a reason to generate or recover a wallet during this review.

Check each saved EVM address on Base, Ethereum mainnet, Arbitrum, and Arc using the source recipe below, even if the manifest names only one network. For a saved Solana wallet, check its registered bridge assets and SOL through the Solana recipe. A known saved Solana wallet does not require another network-choice prompt before these reads.

Show the saved recipient when known, resolving a name only from verified account metadata. Highlight any difference from the selected recipient. Do not rewrite the manifest, retarget an existing transfer, or interpret an old “awaiting deposit” status as today's balance. If a submitted transfer is unresolved, preserve its original recipient and follow [transfer recovery](bridge-transfer.md) before another execution.

## EVM source balances

For Python, use the [native balance recipe](python-funding.md#read-balances). The `.mjs` helper below is for JavaScript/TypeScript; preserve the selected language.

Use [dependencies](dependencies.md) if the bridge SDK is missing. Copy [source-balances.mjs](../scripts/source-balances.mjs) into the application. Replace `EVM_ADDRESS` with the supplied public address:

```sh
node source-balances.mjs EVM_ADDRESS
```

This performs public RPC reads on Base, Ethereum mainnet, Arbitrum, and Arc. It loads the installed bridge registry for token contracts and decimals. It never loads a signer, requests an approval, or registers an account. Optional `BASE_RPC_URL`, `ETHEREUM_RPC_URL`, `ARBITRUM_RPC_URL`, and `ARC_RPC_URL` select existing application endpoints. Do not print credential-bearing RPC URLs.

The result contains one network entry with `chain`, `chainId`, `status`, and `assets`. Each checked amount has a base-unit string `raw`, a decimal string `amount`, and the applicable catalog route IDs. Zero is a successful balance read. `unavailable` means the RPC, network identity, token metadata, or contract read could not be verified. Keep successful amounts when another read fails.

In Step 4, use the separated sections from the skill with short balance lists. Filter successful amounts using exact base units greater than zero; retain zeros internally for route and fee checks. Include each holding's network and identify gas funds. Summarize successfully checked networks with no holdings in one line instead of listing every zero. Keep **Unavailable** networks or assets visible separately. Never add balances across networks. On Arc, the six-decimal ERC-20 USDC interface and eighteen-decimal native gas interface represent the same funds; the helper displays the ERC-20 balance once and marks `alsoPaysGas`.

An active registry route describes supported deployments, not current availability. Run live route and fee checks before offering an executable transfer. Missing or paused routes are not a reason to send funds to a guessed contract.

## Solana source balances

Use the selected public RPC and check that it serves Solana mainnet. Resolve SOL and SPL token mint addresses from `DEFAULT_BRIDGE_REGISTRY.getAssets({ environment: 'mainnet', chainId: 'solana' })`. Use the bridge client's `publicClient.getBalance(address)` for SOL in lamports. For token holdings, read `getTokenAccountsByOwner` filtered by the registry mint with `encoding: 'jsonParsed'`, sum exact `tokenAmount.amount` integers, and verify `tokenAmount.decimals` matches the registry. Include both classic SPL Token and Token-2022 accounts where applicable; USDG uses Token-2022.

Show SOL for fees separately from the selected token. Unavailable RPC reads remain unknown. Solana addresses are case-sensitive; do not lowercase them or treat an EVM address as a Solana account.
