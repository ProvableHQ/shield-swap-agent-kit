# Choose where the bridge work belongs

Resolve the working folder and language early on both the guided-transfer and funding-scripts paths. A guided transfer can need local helpers and recovery files even when the person did not ask to build scripts. Do this before installing packages, writing files, creating a source wallet, or requesting a deposit. Faucet and receive-on-Aleo paths do not need a code project.

## Reuse what is known

Keep a folder and language already chosen in this conversation or passed from account setup. Inspect that project's dependency files and existing funding integration to follow its conventions. If its language is unambiguous, use it without another question. For a mixed-language project, retain the selected component or ask which one to use. A Python setup stays in Python through wallet creation, quotes, execution, and recovery.

If a CLI or connected wallet can complete the journey without new code, retain its selected interface and existing configuration or state location. Do not make someone choose a programming language for a tool they already use.

When the working context is missing, use the conversation, setup handoff, and available project history to suggest likely folders. Give the path and a short reason, such as “the Python project used for account setup.” Check that a suggested path still exists before using it. Historical mentions are suggestions, not a current selection; do not silently use the newest folder, current directory, or installed skill directory. Inspect relevant project files rather than searching unrelated folders or reading secret configuration.

## Ask for what is missing

If the project is unknown, use this short menu. Include only real suggestions, repeat the first option for other relevant projects, and omit it when no candidate is known. Renumber the choices.

```markdown
**Where have you been working?**

1. **Use PROJECT_PATH · LANGUAGE**\
   The project you used for PREVIOUS_TASK.

2. **Use another project**\
   Send the folder path and I'll use its existing setup.

3. **I haven't started a project**\
   We'll choose a folder and language for the bridge work.

Which would you like to use?
```

Ask only for missing details. If the language is already known, keep it and ask for the folder. If the folder is chosen but the language cannot be determined, ask whether to use Python, JavaScript/TypeScript, or another language. For someone without a project, ask where to keep the files and which language they prefer; a small persistent funding folder is enough. If they delegate either choice, make it and state it briefly.

Wait for the missing choices before creating files or a wallet. Public reads that need no project changes can continue. The availability of Node, JavaScript examples, or an EVM wallet does not establish a language preference. Record the chosen folder, language or execution interface, and existing wallet/state locations in the journey context so later steps do not ask again.

If a wallet has already received funds before this check, keep its address, keys, and transfer state. Resolve the missing working context before adding scripts or starting a new bridge submission. Reuse the funded wallet from the chosen language; do not create a replacement. Preserve any transfer approval already given for the same details and limits.
