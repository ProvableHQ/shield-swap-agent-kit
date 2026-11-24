# Build funding into a project

Build the selected app or bot integration, reusable functions, script, CLI, or web UI in the chosen project. Keep the receiving account, selected asset/network pairs, wallet choice, and project context from the conversation. This path ends with working code and usage instructions; a live transfer is a separate action.

## Choose the result and project

This is the build path after the [two-choice opening](../SKILL.md#start-with-two-choices), or a direct request to build. Start with the following choices and the project-context prompt. Keep any form already specified by the person or calling bot selected, and ask only for missing context. Do not show account, balance, wallet, or pair menus until these choices are resolved.

```markdown
**Step 1: What would you like to build?**

- **Add funding to my existing app or bot**\
  Integrate with its existing wallet, configuration, and workflow, for example, funding an account before a trading strategy runs.

- **Create reusable funding functions**\
  A small Python or TypeScript module that other code can call to quote, transfer, and check progress.

- **Create a simple funding script or CLI**\
  Run funding from an editable script or a terminal interface.

- **Add an Aleo funding UI to an existing web application**\
  A wallet connection, asset selection, quote review, and transfer progress flow within the existing app.

- **Other**\
  Tell me about your use-case.

---

**Step 2: Tell me about your project**

What does your project do, and where should funding fit into its workflow? Point me to its folder or relevant component and any wallet setup it already uses.
```

Reuse confirmed project context, or suggest relevant known projects using [working context](working-context.md). If there is no project yet, ask for the intended use, folder, and language. For a web UI, identify the existing application. A bot can supply this information directly. Then continue to the receiving account and wallet/pair steps in [the build path](../SKILL.md#build-bridging-into-the-application).

## Keep the existing project

Use the project and language already selected during setup. Follow [working context](working-context.md#understand-the-integration) to establish the project's purpose, the relevant component, and how funding should fit. Inspect the existing code and reuse context supplied by the person or calling bot before asking for missing details. Resolve the project and desired form before creating files. Do not create a new project merely because funding uses a different SDK.

Follow [dependencies](dependencies.md) for the selected language. Python uses [native Python funding](python-funding.md) and `aleo-bridge-sdk` from PyPI. JavaScript or TypeScript uses the project's existing conventions and Veil. For another language, inspect the existing integration before proposing a supported SDK or external process; explain a concrete capability gap and get that choice before adding a different runtime. Preserve the Aleo account and source wallet. Never automatically wrap Node for a Python project.

Configure the verified Aleo recipient as the default. Keep wallet credentials, provider metadata, and transfer state outside version control. Keep the runnable files in the consumer project so they continue to work without the installed skill.

Use the pair choices from Step 4. If still missing, ask “Which pairs should your project support? Choose one or more,” followed by the supported source network and asset → Aleo asset choices from [route selection](bridge-transfer.md#choose-the-route). Include any intermediate network. Do not reduce several requested pairs to one transfer or infer the supported set from current holdings. An empty source balance does not prevent building; amounts can be supplied when the integration is used.

Verify every selected pair using the installed SDK, then save those choices in the public configuration. Expose them through the chosen interface and accept a pair and amount for each new transfer. Configure the source clients and wallet access needed for the selected networks, reusing existing wallets where compatible. Automatically read relevant public balances when a source address is already known; otherwise skip the check without asking for an address. Verify the routes before creating a wallet.

## Match the selected form

Use the build choice from Step 1 without presenting the menu again. Build only the interface requested:

| Choice | Result |
| --- | --- |
| Add funding to my existing app or bot | Extend the relevant workflow using its existing wallet, configuration, and state handling. Return progress and errors through the app's established interface. |
| Create reusable funding functions | Provide importable functions with explicit inputs and structured results, plus a small calling example. Imports must not create wallets or send transfers. |
| Create a simple funding script or CLI | For a script, provide a readable file with editable configuration. For a CLI, provide the requested commands and help. If the form is unresolved, ask which is wanted before adding argument parsing or command scaffolding. |
| Add an Aleo funding UI to an existing web application | Extend the existing app with wallet connection, supported pairs, quote review, and transfer progress. Reuse its components and wallet integration. |
| Other | Use the stated use-case to agree on the result and how it will be called or used. |

The bundled wallet and state helpers support these implementations; they do not require a user-facing CLI. For web applications, keep local-wallet helpers, server-wallet credentials, and private state on the server. Use the existing browser wallet connection for browser signing; do not bundle local private keys or server credentials into frontend code.

## Connect the selected wallet

Read only the instructions for the selected choice:

| Choice | What to build |
| --- | --- |
| Privy or Dynamic | Use [hosted wallets](hosted-wallets.md) to connect the selected provider. Reuse an existing app and wallet. If a wallet is needed, provide a separate initialization action that saves its identity and reloads it on later runs. |
| Local account | Use [local wallets](local-wallets.md). Connect an existing managed secret inside the process, or use the selected language's bundled helper with `--purpose reusable` during explicit initialization. On macOS, use Keychain for a newly generated key. |
| Wallet to receive deposits | Use the same helper with `--purpose deposit`. Select EVM or Solana from the source network and supported asset. Provide initialization, address display, deposit checks, and transfer actions through the chosen interface. Reload the same wallet on subsequent runs. |

The deposit wallet is a persistent source wallet controlled by this application. It is not a bridge contract or a service that automatically forwards deposits. Receiving assets does not authorize a transfer. Do not describe it as disposable or create a new address on each run.

Keep provider signup, wallet creation, and bridge execution separate. Imports, page loads, balance checks, quotes, and status reads must not provision wallets. Supply an explicit initialization action when needed; run it only when creating a wallet is part of the requested setup. The person completes provider signup and enters credentials through their trusted terminal or secret manager. If credentials are not available, finish the files and offline checks, then name the configuration still required.

Before showing a new address as ready to receive funds, reload its credential in a separate process and complete the backup procedure in the relevant wallet guide. Code setup can finish before those steps; label the wallet as awaiting initialization or verification instead of asking for a deposit.

## Implement the funding operations

Use the [Python recipes](python-funding.md) and [Python wallet helper](../scripts/local_wallet.py) for Python. For JavaScript/TypeScript, use [bridge transfer and recovery](bridge-transfer.md) and copy the needed [balance helper](../scripts/source-balances.mjs), [transfer state helper](../scripts/transfer-state.mjs), and [wallet helper](../scripts/local-wallet.mjs). Keep routing, approvals, transaction construction, and recovery in the selected SDK. Match every created source file and run command to the chosen language; do not add `package.json` to a Python-only project.

Fit wallet connection, configuration, and transfer operations into the chosen form and the project's existing structure. Supply a calling example, app usage instructions, or terminal commands as appropriate. These are the operations to support, not prescribed command names or a requirement to create a CLI:

| Operation | Expected behavior |
| --- | --- |
| Initialize wallet, when needed | Create and persist one wallet only through an explicit initialization action. Reopen the saved identity on later runs; reconcile interrupted creation before trying again. |
| Show address | Read the saved public identity. Show the source network, supported deposit asset, and final Aleo recipient without creating a wallet or loading its private key. |
| Check balances | Read public balances using [balance inspection](balances.md). For deposits, check the exact source asset and native gas. Failed reads remain unavailable. |
| Quote | Accept a human decimal amount, discover the supported route, and show source, recipient, expected confidential receipt, fees, and gas reserve. Include automatic shielding and its fee when bridge delivery is public. Do not sign. |
| Send | Require an amount and an explicitly authorized call or action within the approved limits. Retain the reviewed quote plan. JavaScript uses `executeOnce`; Python uses `Bridge.execute` with `FileCheckpointStore` and the operation guard described in its guide. |
| Status | Recover the original operation without signing: `inspectTransfer` in JavaScript, `Bridge.recover` in Python. Report source submission, destination delivery, and verification still needed. |
| Continue | Follow only the SDK's permitted next action within the existing authorization: `advanceTransfer` in JavaScript, `Bridge.resume` or `Bridge.complete` in Python. An unknown result must not start a replacement transfer. |
| Finish inbound funding | After confirmed public arrival, shield the received amount automatically within the approved limits and verify usable records. Direct private delivery skips shielding. Do not expose a separate shielding confirmation or finish at public receipt. |

Implement bridge delivery and shielding as separate persisted stages of one funding operation. Use the selected language's [Python completion instructions](python-funding.md#quote-execute-and-recover) or [Veil completion instructions](bridge-transfer.md#verify-delivery-and-confidential-holdings). Check privacy support, recipient access, and completion fees before submission. Status reads remain read-only; the authorized execution flow or continuation performs shielding. Never shield unrelated holdings or repeat an uncertain shielding submission.

Module imports and app startup must not initiate transfers. A script or CLI's default invocation should print help or read balances. Keep signer construction lazy so public reads work without provider credentials or an unlocked key store. For a local account loaded from a secret manager, save its verified public address during explicit connection setup; address display must not load the secret merely to rediscover it.

Bind each operation directory to its source wallet, recipient, route, and amount. An existing directory means inspect or continue that operation, not choose a new directory and resubmit. Require the caller to name a new operation for a genuinely new transfer. Do not automatically retry execution after an exception.

When quote and send happen in separate calls or processes, preserve the executable plan only if the installed SDK supports serializing and reloading it with expiry checks. Otherwise obtain and review the quote in the send process before execution, or execute within explicitly supplied amount and fee bounds. Do not reconstruct a plan from the displayed summary or imply that a new quote is the one previously approved.

For Base or Arbitrum USDC, follow the two-leg Arc procedure in the bridge guide. Use separate operation directories, verify control of the intermediate wallet, and calculate the second amount from delivered funds after reserving gas. Do not build a script that assumes both legs complete in one transaction.

For deposit wallets, show the exact chain, supported asset, source address, required gas, and Aleo recipient. Explain how to check the deposit, obtain a quote, send, and inspect the same operation after a restart through the selected interface. Do not start a watcher that bridges every arrival. Scheduled or unattended funding requires its own explicit amount, asset, recipient, and fee limits.

## Check and hand over

Run the project's relevant syntax or type checks and offline checks with mocked signing and submission. Exercise the chosen interface: an import and calling example for functions, the existing workflow for an app or bot, or the wallet, quote, and progress interactions for a web UI. Check command help only when a CLI was requested. Verify that initialization is explicit, reads do not sign, missing credentials produce useful errors, and status or restart does not submit a second transfer. Also check automatic shielding after public arrival, no extra shield after private delivery, and recovery after an uncertain shielding submission. Use the bundled helpers' tested recovery behavior instead of recreating it.

With available public addresses, run balance reads and label them as read-only validation. Test provider access or credential reload only when configured. Do not send a funded transaction to prove that code setup is complete.

Finish with the changed files, selected wallet and Aleo recipient, usage examples for the chosen interface, and remaining configuration. Distinguish code written, offline checks passed, wallet access verified, and live transfer tested. If credentials are missing, say the integration is prepared and still needs configuration. If a wallet was created, include its backup and recovery location without secrets.

Return the integration's form and location and the actual funding status to the calling setup flow. Do not label an unfunded account as funded or a trading integration as operational because code exists. If the person also asked to fund now, continue with the guided transfer using the integration and the choices already made.
