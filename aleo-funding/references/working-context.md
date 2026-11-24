# Choose where the bridge work belongs

Resolve the working folder and language early on both the guided-transfer and build paths. A guided transfer can need local helpers and recovery files even when the person did not ask to build scripts. Do this before installing packages, writing files, creating a source wallet, or requesting a deposit. Faucet and receive-on-Aleo paths do not need a code project.

## Reuse what is known

Keep a folder and language already chosen in this conversation or passed from account setup. Inspect that project's dependency files and existing funding integration to follow its conventions. If its language is unambiguous, use it without another question. For a mixed-language project, retain the selected component or ask which one to use. A Python setup stays in Python through wallet creation, quotes, execution, and recovery.

If a CLI or connected wallet can complete the journey without new code, retain its selected interface and existing configuration or state location. Do not make someone choose a programming language for a tool they already use.

When the working context is missing, use the conversation, setup handoff, and available project history to suggest likely folders. Give the path and a short reason, such as “the Python project used for account setup.” Check that a suggested path still exists before using it. Historical mentions are suggestions, not a current selection; do not silently use the newest folder, current directory, or installed skill directory. Inspect relevant project files rather than searching unrelated folders or reading secret configuration.

## Ask within the selected path

Keep project questions out of the [two-choice opening](../SKILL.md#start-with-two-choices). They belong in Step 3 of a guided bridge, after the account and funding method, or Step 2 of building, alongside the desired integration. Include only real project suggestions and omit them when none is known. Keep a confirmed project or connected tool selected.

Ask only for missing details. If the language is already known, keep it and ask for the folder. If the folder is chosen but the language cannot be determined, ask whether to use Python, JavaScript/TypeScript, or another language. For someone without a project, ask where to keep the files and which language they prefer; a small persistent funding folder is enough. If they delegate either choice, make it and state it briefly.

Wait for the missing choices before creating files or a wallet. Public reads that need no project changes can continue. The availability of Node, JavaScript examples, or an EVM wallet does not establish a language preference. Record the chosen folder, language or execution interface, and existing wallet/state locations in the journey context so later steps do not ask again.

If a wallet has already received funds before this check, keep its address, keys, and transfer state. Resolve the missing working context before adding scripts or starting a new bridge submission. Reuse the funded wallet from the chosen language; do not create a replacement. Preserve any transfer approval already given for the same details and limits.

## Understand the integration

For a build, establish what the project does and where funding belongs before choosing its implementation. Accept context from the person, a calling bot, or the existing setup. Read the selected project's contributor guidance, dependency files, and relevant app or bot code to fill in what is already evident. A folder and programming language alone do not select a CLI.

Include this prompt in the build path's project step when the purpose or integration point is missing: “What does this project do, and where should funding fit into its workflow? Point me to the relevant folder or component and any wallet setup it already uses.” If some of that is known, ask only for the missing part. A bot can supply the same information directly; no human menu reply is needed when the context resolves the choices.

For an existing app or bot, identify what starts funding, who authorizes it, and where the result should be returned or shown. For a web UI, also identify the existing frontend, backend, and wallet connection. Use the project's conventions and ask only about decisions that cannot be inferred. Request references to configuration or wallet code, never credentials in chat.

Use the five build choices in Step 1 of [the build path](funding-scripts.md#choose-the-result-and-project) to establish the desired form. Selecting **Create a simple funding script or CLI** does not by itself choose a CLI; clarify that distinction when unresolved. For **Other**, ask about the use-case and agree on a concrete result before writing code. Carry the project purpose, relevant component, desired form, and existing wallet connection into the build instructions. Do not add another numbered onboarding step.
