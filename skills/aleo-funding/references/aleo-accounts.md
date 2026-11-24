# Find the Aleo account to fund

Retain a public recipient explicitly chosen in the conversation or passed from account setup. It is the selected destination even if another account is named `default`. For an automatic default, use the existing application's SDK account selection. Do not choose the first filename, the most recently modified account, or a remembered address.

## Resolve the default

Both SDKs use these location rules:

| Setting | Priority |
| --- | --- |
| Account name | Explicit name supplied by the application, then `ALEO_ACCOUNT`, then `default`. |
| Account directory | Explicit directory supplied by the application, then `ALEO_ACCOUNTS_DIR`, then `~/.aleo/accounts`. |

The selected name chooses the account file. The key loader then uses this order:

1. An explicit private key already supplied inside the trusted application process.
2. `ALEO_PRIVATE_KEY`, including the supported `SHIELD_SWAP_PRIVATE_KEY` alias.
3. `ALEO_PRIVATE_KEY_FILE`, including the supported `SHIELD_SWAP_PRIVATE_KEY_FILE` alias.
4. The selected account file.
5. A legacy key supplied by the existing application, only when no account file exists and no earlier source resolves.

Use Veil `loadAccount({ ...existingOptions, prompt: false })` or Python `keystore.load(..., prompt=False)` when resolving an existing runtime key source. Print only the resolved public address, source, and saved name if present, never the loaded account object. Do not retrieve a key from chat, command arguments, or a raw profile dump to populate these options. Keep `expectedAddress` / `expected_address` checks already used by the application.

An explicit private key bypasses the environment key variables. For the sources it consults, the SDK validates conflicts as well as priority: different environment keys, empty configured sources, or a key that disagrees with the selected file must be resolved. Check whether a key variable is present; an empty configured value is not an absent source. Do not silently skip an error to another account. A runtime-only account can be selected without a saved account file. Label it **Environment account** or the known application's account name instead of inventing a saved name.

If no explicit or environment key source is configured and a valid selected account file exists, its public metadata is enough to choose a receiving address. Use `accountInfo` / `keystore.info` without unlocking it. A locked or address-only account can receive funds; do not claim signing access was checked. If the application supplies a legacy key alongside an account file, retain the SDK's address-match validation. Missing or invalid selection remains unresolved until the person chooses an account or supplies a public address. Do not create an account as a discovery side effect.

## Enumerate the saved accounts

Inspect filenames in the resolved account directory, then ask the SDK for each file's public metadata. The shared SDKs do not expose an account-list command; do not invent `account list` or parse entire account JSON files into tool output.

- Veil: for each regular `<name>.json` file, call `accountInfo({ name, dir })` from `@provablehq/veil-aleo-sdk/node`.
- Python: for each regular `<name>.json` file, call `keystore.info(name=name, dir=directory)`.
- CLI: inspect each discovered name with `shield-swap account show --name NAME --dir DIRECTORY --json`, using the application's installed command. Python also provides `python -m aleo.keystore show --name NAME --dir DIRECTORY --json`.

Pass names and paths as structured process arguments when invoking commands. Accept SDK-valid names only; skip symlinks and non-account files. A missing directory means there are no saved accounts there, not that no environment or connected account exists. Report unreadable or invalid account entries separately, without presenting an unverified address as fundable.

Enumerate the configured directory. If it differs from `~/.aleo/accounts`, also inspect the standard directory for other saved accounts, retaining each entry's directory so equal names are not conflated. Include another custom directory only if the existing setup identifies it; do not search unrelated files, projects, or Keychain entries for wallets. These metadata APIs do not unlock keys or contact a network, though they can tighten account-file permissions to owner-only.

Put the resolved destination first and mark it **Selected by default**. List the other verified destinations with name and full address; distinguish equal names from different directories with a short location label. Combine aliases for the same address into one destination row. Include a known environment or connected-wallet account if it is not already represented. Keep **Another Aleo address** as the final option.

Choosing another receiving account changes this funding journey's destination. Preserve the original application's account selection and recovery stores unless the person also asks to switch them. Verify the selected destination again in the transfer summary before moving funds.
