---
name: trading-integration
description: Create a Shield Swap trading bot or application, or add trading to an existing project using Python or TypeScript/JavaScript, including concurrent swaps, claims, and interrupted-operation recovery.
---

# Add Shield Swap trading

Build callable trading code in an existing project or a new bot or application. Reuse the selected account, network, wallet, and any existing configuration and logging. The bundled modules provide a working starting point for submitting independent swaps and collecting their outputs without repeating a request after a restart.

## Understand the project

Retain context passed by the main Shield Swap skill, account setup, funding, or a strategy skill. If the request already identifies the project and desired behavior, start there. For an existing application, ask what it does, where its code lives, and where trading should fit. For a new bot or application, begin with what the user wants it to do. Suggest relevant projects from the conversation when they want to extend existing work.

When the desired deliverable is unclear, ask **What would you like to build?** using the host's interactive selection tool when available. In Claude Code, call `AskUserQuestion` with one question, `header: "Build"`, and `multiSelect: false`. Use these four options, with the titles as plain `label` values and the following sentences as `description` values:

1. **Create or extend a trading application** — Create a new app or bot, or add Shield Swap trading to an existing one.
2. **Reusable trading functions** — Let other code request quotes, submit swaps, and check progress.
3. **Script or CLI** — Provide commands for a specific trading workflow.
4. **Add trading to a web application** — Fit wallet connection, approval, and transaction progress into its existing interface.

Keep these four primary choices so they fit Claude's selector. The first covers both new and existing applications or bots; ask which only if the conversation has not already established it. Web application integration remains a separate choice. A request that already specifies a website, bot, or other deliverable goes directly to that path.

Let the selection tool style its labels; do not insert Markdown markers into plain tool fields or replace the selector just to make labels bold. If no interactive tool is available, show the four numbered choices as Markdown with bold titles and regular descriptions, outside code fences. In unattended operation, use the supplied choice or report the missing requirement to the caller without opening a prompt.

Ask only for missing choices. Do not turn a request for functions into a CLI. A bot invoking this skill can supply the same project and policy information directly.

For a new bot, establish what triggers a trade and which assets it should trade. For a new application, establish what its user should be able to do. Then resolve the language, project location, and how it will run, retaining choices already supplied. Create the project around that behavior using the bundled trading modules. Reuse the selected Aleo account and recovery state. Provide a working simulation or quote-only mode before enabling live execution; a request to create a bot is not a request to start recurring trades.

When the requested bot is an arbitrage bot, load the available `arbitrage` skill and pass this context. If that skill already supplied the strategy, implement its trading component without presenting the project or strategy menu again.

## Build the integration

Read [the trade lifecycle and execution contract](references/execution.md) and [assets, balances, and quotes](references/markets.md), then the selected language:

- [Python](references/python.md): native SDK adapter, callable workflow, and SDK-managed record inventory.
- [TypeScript and JavaScript](references/typescript.md): Veil adapter, callable workflow, and a durable implementation of Veil's record-store interface.

The Python and Node examples target local server/bot signers. For a web application, read [the browser wallet integration](references/browser.md) instead of copying the Node adapter. It covers wallet grants, record requests, persistence across refresh, and confirmation of both transactions. Retain the connected wallet.

Load these procedures when the integration needs them:

| Work to implement | Required reference |
| --- | --- |
| Any live submission or claim | [Fees and proving](references/fees.md) |
| Repeated trades, multiple writers, or fragmented holdings | [Record inventory and concurrency](references/concurrency.md) |
| Startup with pending trades, a timeout, or an uncertain result | [Inspect and recover a trade](references/recovery.md) |

Use the procedures and bundled examples to implement the requested behavior. A statement such as “use the SDK planner” is not a completed inventory feature. Provide the call, interpret its result, and connect it to the application's next action. Keep these details in the implementation and its documentation; the opening menu stays brief.

Use the latest published dependencies from PyPI or npm. Copy the relevant modules into the consumer project or integrate their behavior into its existing services. SDKs own quoting, transaction construction, signing, record reservations, and transaction recovery. The application modules add stable request IDs and persist progress between those SDK calls.

A functioning setup is a prerequisite for execution, not for writing or testing code. When credentials, scanner access, or funds are missing, invoke an available `aleo-account-setup` or `aleo-funding` skill with the selected account and project. Preserve an explicitly code-only milestone. Do not create an account, register a scanner, request faucet funds, or trade during import or a quote call.

## Verify the result

Run the bundled tests after adapting the modules. In an installed copy, verify native SDK imports and quote shapes against the actual package versions. Test two different requests together, duplicate requests, restart before claim, and lost responses during submission and claim. Run a plain single-swap consumer as well as any strategy consumer. Exercise the application entrypoints you added, not only the copied library tests. For a web application, test refresh after submission, wallet rejection, account switching, and a claim whose receipt is still pending.

Before live execution, establish the account, network, allowed assets, size, fees, and spending authority. Set the application's record and operation limits to match. Missing limits are questions for the caller, not defaults to invent. Read [concurrency and recovery](references/concurrency.md) when more than one swap can be outstanding.

Report the files and callable entrypoints produced, how they were checked, and whether any transactions were actually submitted. A working quote or passing simulation does not establish funded execution.
