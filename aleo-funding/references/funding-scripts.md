# Build reusable funding scripts

Create runnable files in the chosen project so the person can fund their Aleo account later. Keep the receiving account, source network, asset, and wallet choice from the conversation. This path ends with scripts and instructions; a live transfer is a separate action.

## Keep the existing project

Use the project and language already selected during setup. If either is missing, follow [working context](working-context.md), suggesting relevant projects from available history and asking only for what is missing. Resolve both before creating files. Do not create a new project merely because funding uses a different SDK.

Follow [dependencies](dependencies.md) for the selected language. Python uses [native Python funding](python-funding.md), Python entrypoints, and `aleo-bridge-sdk` from PyPI. JavaScript or TypeScript uses the project's existing conventions and Veil. For another language, inspect the existing integration before proposing a supported SDK or external process; explain a concrete capability gap and get that choice before adding a different runtime. Preserve the Aleo account and source wallet. Never automatically wrap Node for a Python project.

Configure the verified Aleo recipient as the default. Keep wallet credentials, provider metadata, and transfer state outside version control. Keep the runnable files in the consumer project so they continue to work without the installed skill.

After the wallet choice, ask which source network and asset the scripts should support, unless already supplied. Automatically read relevant public balances when a source address is already known; otherwise skip the check without asking for an address. Verify the route using the bridge registry before creating a wallet. Start with the selected route; an empty source balance does not prevent writing the scripts.

## Connect the selected wallet

Read only the instructions for the selected choice:

| Choice | What to build |
| --- | --- |
| Privy or Dynamic | Use [hosted wallets](hosted-wallets.md) to connect the selected provider. Reuse an existing app and wallet. If a wallet is needed, provide a separate initialization command that saves its identity and reloads it on later runs. |
| Local account | Use [local wallets](local-wallets.md). Connect an existing managed secret inside the process, or provide an initialization command using the selected language's bundled helper with `--purpose reusable`. On macOS, use Keychain for a newly generated key. |
| Wallet to receive deposits | Use the same helper with `--purpose deposit`. Select EVM or Solana from the source network and supported asset. Provide initialization, address display, deposit checks, and bridge commands. Reload the same wallet on subsequent runs. |

The deposit wallet is a persistent source wallet controlled by this application. It is not a bridge contract or a service that automatically forwards deposits. Receiving assets does not authorize a transfer. Do not describe it as disposable or create a new address on each run.

Keep provider signup, wallet creation, and bridge execution separate. Imports, balance checks, quotes, and status commands must not provision wallets. Supply an initialization command when needed; run it only when creating a wallet is part of the requested setup. The person completes provider signup and enters credentials through their trusted terminal or secret manager. If credentials are not available, finish the files and offline checks, then name the configuration still required.

Before showing a new address as ready to receive funds, reload its credential in a separate process and complete the backup procedure in the relevant wallet guide. Script setup can finish before those steps; label the wallet as awaiting initialization or verification instead of asking for a deposit.

## Write the files and commands

Use the [Python recipes](python-funding.md) and [Python wallet helper](../scripts/local_wallet.py) for Python. For JavaScript/TypeScript, use [bridge transfer and recovery](bridge-transfer.md) and copy the needed [balance helper](../scripts/source-balances.mjs), [transfer state helper](../scripts/transfer-state.mjs), and [wallet helper](../scripts/local-wallet.mjs). Keep routing, approvals, transaction construction, and recovery in the selected SDK. Match every created source file and run command to the chosen language; do not add `package.json` to a Python-only project.

Write a wallet connection module, a funding entrypoint, public configuration, and short project-specific run instructions. Adapt names to the project. Implement these operations as commands or callable functions; these are the interface to build, not existing SDK command names:

| Operation | Expected behavior |
| --- | --- |
| Initialize wallet, when needed | Create and persist one wallet only through an explicit command. Reopen the saved identity on later runs; reconcile interrupted creation before trying again. |
| Show address | Read the saved public identity. Show the source network, supported deposit asset, and final Aleo recipient without creating a wallet or loading its private key. |
| Check balances | Read public balances using [balance inspection](balances.md). For deposits, check the exact source asset and native gas. Failed reads remain unavailable. |
| Quote | Accept a human decimal amount, discover the supported route, and show source, recipient, estimated receipt, fees, gas reserve, and public or confidential delivery. Do not sign. |
| Send | Require an explicit execution command and amount. Retain the reviewed quote plan and enforce the approved limits. JavaScript uses `executeOnce`; Python uses `Bridge.execute` with `FileCheckpointStore` and the operation guard described in its guide. |
| Status | Recover the original operation without signing: `inspectTransfer` in JavaScript, `Bridge.recover` in Python. Report source submission, destination delivery, and verification still needed. |
| Continue | Follow only the SDK's permitted next action within the existing authorization: `advanceTransfer` in JavaScript, `Bridge.resume` or `Bridge.complete` in Python. An unknown result must not start a replacement transfer. |

The default invocation should print help or read balances. Keep signer construction lazy so help and public reads work without provider credentials or an unlocked key store. For a local account loaded from a secret manager, save its verified public address during explicit connection setup; address display must not load the secret merely to rediscover it.

Bind each operation directory to its source wallet, recipient, route, and amount. An existing directory means inspect or continue that operation, not choose a new directory and resubmit. Require the caller to name a new operation for a genuinely new transfer. Do not automatically retry execution after an exception.

For separate quote and send commands, preserve the executable plan only if the installed SDK supports serializing and reloading it with expiry checks. Otherwise obtain and review the quote in the send process before execution, or execute within explicitly supplied amount and fee bounds. Do not reconstruct a plan from the displayed summary or imply that a new quote is the one previously approved.

For Base or Arbitrum USDC, follow the two-leg Arc procedure in the bridge guide. Use separate operation directories, verify control of the intermediate wallet, and calculate the second amount from delivered funds after reserving gas. Do not build a script that assumes both legs complete in one transaction.

For deposit wallets, write instructions showing the exact chain, supported asset, source address, required gas, and Aleo recipient. Include the commands to check the deposit, obtain a quote, send, and inspect the same operation after a restart. Do not start a watcher that bridges every arrival. Scheduled or unattended funding requires its own explicit amount, asset, recipient, and fee limits.

## Check and hand over

Run the project's relevant syntax or type checks, help command, and offline checks with mocked signing and submission. Verify that initialization is explicit, read commands do not sign, missing credentials produce useful errors, and status or restart does not submit a second transfer. Use the bundled helpers' tested recovery behavior instead of recreating it.

With available public addresses, run balance reads and label them as read-only validation. Test provider access or credential reload only when configured. Do not send a funded transaction to prove that code setup is complete.

Finish with the file locations, selected wallet and Aleo recipient, exact commands for the implemented entrypoint, and remaining configuration. Distinguish files written, offline checks passed, wallet access verified, and live transfer tested. If credentials are missing, say the scripts are prepared and still need configuration. If a wallet was created, include its backup and recovery location without secrets.

Return the scripts path and actual funding status to the calling setup flow. Do not label an unfunded account as funded or a trading integration as operational because scripts exist. If the person also asked to fund now, continue with the guided transfer using these scripts and the choices already made.
