# Connect trading tools and check private balances

Use the language and project chosen in the conversation. These recipes authenticate to Shield Swap, register the account's view key for scanning, and read private balances. They create no new account, durable API token, airdrop, bridge transfer, or trade.

Before registration, explain that the Record Scanning Service receives the account's view key so it can find and read its records. The private key stays in the selected storage. A new-project choice made after this explanation is enough to proceed. Preserve prior authorization and custom scanner choices.

Use [dependencies](dependencies.md) for Veil `main` or the latest Python SDK releases from PyPI. Run application code from the person's project, outside this installed skill. Keep a new project in its own directory. Inspect an existing project before deciding that it needs another directory or account.

## New JavaScript or TypeScript project

Copy [setup-veil.mts](../scripts/setup-veil.mts) and [public-balances.mjs](../scripts/public-balances.mjs) into the chosen project together. Install the bundled dependency recipe's Veil and Shield Swap packages there. Use the existing package manager; the commands below assume npm.

If the project type-checks this TypeScript helper, enable `allowJs` so TypeScript can infer the adjacent `.mjs` module's types.

Replace `ACCOUNT_NAME`, `ALEO_ADDRESS`, and `STATE_DIRECTORY` with the chosen account name, verified public address, and the new application's state directory. These values are public configuration. The helper creates a separate subdirectory for each network and address within `STATE_DIRECTORY`.

```sh
npx --no-install tsx setup-veil.mts --account ACCOUNT_NAME --address ALEO_ADDRESS --network both --state-dir STATE_DIRECTORY
```

Use `--network mainnet` or `--network testnet` when the person requested only that network. Do not take a testnet default from an older example. For encrypted storage without a runtime password source, give the command to the person to run in their own terminal with `--prompt`. A password entered there is not available to a later process; retain their chosen runtime password source for ongoing use.

`openSession()` loads the named account and verifies the expected address, creates a network-bound client and durable swap store, and signs the API challenge. It does not create an API token. `checkPrivateBalances()` triggers encrypted view-key registration with the Record Scanning Service and waits for synchronization before reading the eight assets' unspent records. An empty account still runs the registration check. The default edge gateway needs no separate consumer signup or API key.

Keep `openSession()` and the selected account, address, and state directory in the application so later runs reuse its configuration and recovery data. Use the returned `client` for subsequent integration. The setup command itself only reports public account details, API/scanner status, and balance totals.

## New Python project

Use the [Python dependency recipe](dependencies.md#python) to install the latest PyPI releases, then run its [capability check](dependencies.md#check-account-support-and-both-networks). Continue only when the required account interfaces and both network modules are available. Copy [setup_python.py](../scripts/setup_python.py) into the chosen project.

Replace `ACCOUNT_NAME`, `ALEO_ADDRESS`, and `STATE_DIRECTORY` as above. Activate the project's virtual environment, then run:

```sh
python setup_python.py --account ACCOUNT_NAME --address ALEO_ADDRESS --network both --state-dir STATE_DIRECTORY
```

For encrypted storage without a runtime password source, have the person run the command in their own terminal with `--prompt`. Keep the password out of captured agent input.

`open_session()` verifies the named account, opens or creates a profile with `create=False`, and checks its address and network before connecting. Profiles and durable journals are separated by network and address beneath `STATE_DIRECTORY`. The helper builds the native SDK client, authenticates with the API, and explicitly checks scanner registration and synchronization. It avoids `onboard()`, which can request funds. It also avoids treating a profile constructor's suppressed scanner error as successful registration.

Keep the returned client, `dex`, and profile for subsequent application work. On restart, call the same factory with the same configuration. The SDK journal retains recovery state; do not replace it when reconnecting.

## Reuse an existing setup

Ask for the project folder or connected tool if it was not already supplied. Inspect dependency manifests, the selected public address and network, account-name configuration, and paths to existing profiles or recovery stores. Do not print private keys, view keys, credentials, or journal contents. A missing file or a different folder name does not establish that an account is obsolete.

When the account matches, retain its signer, network, endpoints, and recovery paths. Add only missing configuration. Check API access and scanner state independently. A connected wallet may supply its own record access; keep that provider and its permissions rather than exporting a private key to install a hosted scanner.

For an existing Veil client, call `authenticateShieldSwap()` on the configured Shield Swap client, then use its record provider and `getPrivateBalances({ programs })` for the registry's underlying token programs. The bundled Veil helper shows the call sequence and handling for the default hosted scanner. Retain the existing store and any custom provider. Confirm synchronization before interpreting an empty scan as zero.

For an existing Python client, authenticate its API with the selected account's challenge-signing function. On a native `Aleo` facade, `client.records.register(client.default_account, start=0)` returns a result whose `ok` must be true; `client.records.status()` must report `data.synced` before private zeros are meaningful. Then call `dex.get_private_balances(programs, account=client.default_account)`. The bundled Python helper shows the full sequence. Keep custom providers and existing profile/journal locations. Do not use a status method that silently falls back to public balances after a scanner failure.

For existing CLI or MCP tools, inspect their exposed capabilities and configured public identity first. Use a capability that separately authenticates or reads balances without funding. If the CLI only offers a combined setup-and-funding command, explain the gap and offer the bundled Veil helper as an account check or a Node integration. It does not configure the CLI's session automatically. If an MCP connection lacks scanner or balance access, report that specific gap; basic setup is not complete for that interface yet. Do not replace an explicitly selected interface without agreement.

Check both networks when that is part of the selected setup. An application bound to testnet stays on testnet; use a separate network-bound client for the mainnet check. Confirm the same public address. If a network cannot be checked, retain its status as unknown and ask whether the person has funds there.

## Another language or framework

Ask which language or framework and whether there is an existing project. Inspect the project's current Aleo integration. Keep its signer and use its supported API authentication and record-scanning interfaces. Do not claim that selecting a language installs an integration.

If it has no supported signer or scanner, explain the concrete gap and offer a small Python or Node service using the bundled recipe, or an existing connected tool whose capabilities cover the task. Ask which approach they want before substituting a different runtime. Do not implement a new signing scheme or a language binding as part of basic setup.

## Read the result

The helpers emit one JSON result per network. `authenticated: true` confirms API sign-in. `scanner: "synced"` confirms registration and a completed history scan before the asset reads. Asset amounts are decimal strings; keep mainnet and testnet, and public and private holdings, separate. `status: "incomplete"` means one or more asset balances could not be verified; retain the successful amounts and leave the others unknown.

`scan_pending` means the scanner needs more time. Report that and retry the same check later without generating another account or requesting funds. `unavailable` names the failed stage; diagnose the account, credentials, endpoint, or service before claiming setup is complete. The helpers deliberately omit raw exception bodies because SDK errors may contain request data. For diagnosis, inspect public configuration and sanitized service status without dumping request payloads.

Missing or ambiguous registry entries remain **Not listed** or **Needs verification**. A successful scan for the listed assets is not proof that the account holds no other assets. Return the observed results to the skill's next-step menu. Funding and trading are not run by these helpers.
