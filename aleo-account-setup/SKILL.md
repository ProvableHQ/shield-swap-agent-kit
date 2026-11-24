---
name: aleo-account-setup
description: Use for basic Shield Swap setup, including creating or importing a named Aleo account, choosing private key storage, checking mainnet and testnet balances, and connecting a Python, JavaScript, or existing trading setup to the API and record scanner.
---

# Set up your account and trading tools

Guide someone from a named Aleo account to connected trading tools and a clear view of their balances. Start with account and storage choices, show public holdings on mainnet and testnet, then help connect their chosen application to Shield Swap and the Record Scanning Service. Finish by offering the next step that fits their funds. Keep the conversation to the choice in front of them.

This skill includes its own account commands, balance check, and application setup recipes. Use these bundled resources through the whole setup. Do not hand account creation off to an older setup guide or run `shield-swap setup` or Python `onboard()` as a shortcut: those combine configuration with funding. When a funding option is selected, invoke `aleo-funding` with the setup context described below. Trading remains a separate action.

Veil, the Python SDK, and the Shield Swap CLI share account files in `~/.aleo/accounts`. An account saved by one can be loaded by the others. An environment-supplied private key also works without saving an account file.

## Start with what is already there

Keep the chosen language, account, and storage preference. Check the selected tool and any existing account before asking someone to start over. Read [setup commands](references/commands.md) for the interface you need; use [dependencies](references/dependencies.md) when installation is needed. Inspect public account details and whether environment variables are set, without printing their values or opening private key files in tool output.

If no tool was selected, use the existing Python or Node project. Outside a project, choose an available account command that needs the least additional setup and say which one you are using. Ask about a runtime only if the choice affects their application.

An existing account needs a short confirmation of its public address, unless it was already selected. A missing local file means there is no saved account at that location; someone may still have an account in a wallet or supply it through their environment. An unlock error means the existing account needs attention, not replacement.

Browser wallets and connected wallet services keep their own signing flow. Do not ask for an exported private key to replace that connection. Preserve an existing MCP profile or custom signer and follow the existing-setup path in [connect trading tools](references/trading-setup.md#reuse-an-existing-setup).

## Help them choose

Use the same separated menu in every agent: bold step headings, option names with short descriptions beneath them, and horizontal rules between the steps and before the reply instruction. Use the exact headings "Step 1: Create or Import an Aleo Account" and "Step 2: Choose account storage". Number the account options and letter the storage options. Keep the layout readable without Markdown styling; avoid boxes, blockquotes, tables, and aligned columns. Render this template as Markdown in the conversation; the code fence here only separates the template from the instructions.

When both choices are open on a Mac, show:

```markdown
Shield Swap runs on Aleo allowing confidential swaps and market making. To trade, provide liquidity, and store assets privately, an Aleo account needs to first be created and funded. Follow the simple steps below to complete this process.

**Step 1: Create or Import an Aleo Account**

1. **Create a new account.**\
   Create a new Aleo account and fund it later.

2. **Import existing account.**\
   Import an existing Aleo account.

What would you like to name the account? For example, **trading** or **savings**.

---

**Step 2: Choose account storage**

- **A. Mac Keychain · Recommended**\
  Store and access the account in the macOS keychain.

- **B. Encrypted file**\
  Store and access the account on disk, encrypted with a password.

- **C. Environment variables**\
  Put an account in environment variables available when trading on Shield Swap.

- **D. Unencrypted file**\
  Store an account on disk unencrypted. Lowest friction, highest risk.

---

Reply **1A trading** for a new account named trading in Keychain, or send your choices and account name.

For an import, you'll enter your private key in your own terminal. It stays out of this chat.
```

Accept combinations such as `1A trading`, `2 B savings`, or the choices written in words. If someone gives only the account and storage choices, ask for the name before creating or importing the account. Keep the menu compact: save tool-selection explanations, storage details, and commands for the step that needs them. If an existing account affects the choice, add one short sentence using its verified public address.

Ask only for decisions the conversation has not already answered. Keep a supplied name or the name of an existing saved account; omit the name question when it is already settled. If the account is chosen, show only Step 2 and ask for its letter, along with the name if still needed; if storage is chosen, show only Step 1 and ask for its number and any missing name. Keep those step labels when showing one section. If the account, storage, and name are chosen, continue with setup.

Adapt the storage section to where the application will run. On Linux or Windows, omit A, mark B as recommended, and use **1B trading** in the reply example. For a deployed bot that uses a secret manager, mark C as recommended. Retain the option letters when omitting an unavailable choice. Keep an existing environment source when already selected.

Explain these details when the selected option needs them or someone asks:

- macOS Keychain keeps the private key in this Mac's Keychain. The account file contains its address and a reference to the Keychain entry. A copy of that file alone cannot restore the account on another machine.
- A password-encrypted file keeps the private key on disk. Opening it needs the password, which can be entered in the terminal or supplied to an unattended process by its secret manager.
- Environment variables let a process receive a private key, or the path to a private key file, on each run. Loading it does not save another copy. The place supplying it remains responsible for storage and backup.
- An unencrypted file needs no password. Anyone who can read it can use the account. This is the SDK default when storage is omitted, so pass the chosen storage explicitly.

Do not silently choose unencrypted storage when someone skips that decision. If they ask you to choose, use the recommendation for their environment and say what you will use. Wait for an account choice before creating a new address. In an unattended task, report any missing choice to the caller instead of opening a prompt.

Keep paths, variable names, and command flags out of the opening conversation unless they help answer a question. Introduce them when the selected path needs them.

## Carry out the setup

Run installation, account inspection, and operations that neither accept nor display secrets yourself. Creating a new account in Keychain or an explicitly chosen unencrypted file can run without asking someone to type a secret.

For an import or password prompt, prepare the exact command and have the person run it in their own terminal. Explain what the prompt asks for and that the input stays hidden. For example:

> Run this in your terminal. It asks for your existing private key or seed phrase and saves the account in Keychain. Enter it there, not in this chat. After it finishes, I’ll check the address with you.

Show only the command for the chosen interface and storage. Use the chosen account name throughout creation or import, verification, and the application's runtime configuration. Do not silently use `default`; use it only when selected. Check whether the name is already in use before saving. If it is, ask whether to use that saved account or choose another name. Never overwrite an account to resolve a naming conflict.

Keep private keys, seed phrases, and passwords out of chat, command arguments, generated scripts, and captured output. A person can provide a file path or arrange secret injection without revealing the value. Commands that export a private key or display a new seed phrase belong in their own terminal too. If a secret is pasted into chat, do not repeat or use it; explain that it is now in the conversation history and arrange a replacement if it controls funds.

For environment setup, preserve the existing secret manager or terminal configuration. Use the SDK loader to check the account in that environment. Do not import it into a saved account unless a local copy was requested. A new account intended only for environment use must have its displayed private key saved in the person's secret manager before setup is complete; follow the terminal-only path in the command reference.

## Confirm the account

Check the saved public details, then load the selected account and report only its address and source. This checks access to the private key without signing a transaction. For a password entered in a person's terminal, run that check there or use an already configured secret source. If you can inspect the account but cannot unlock it, say that access still needs checking.

A successful terminal check does not supply the password to later processes. Continue password-dependent setup in that terminal, or arrange the chosen runtime password source before handing control back to another tool.

For an imported account, compare the address with the intended wallet address. A seed phrase can derive more than one address; resolve a mismatch before continuing. For a new account, explain how to keep a backup using the selected storage's instructions before funding it.

Confirm the observed result, for example:

> Your account **[chosen name]** is set up at **[verified address]**. Its private key is in this Mac's Keychain, and I checked that your tools can load it. Keep a backup in your password manager before adding funds; I’ll give you the command to do that in your own terminal.

Use the actual name, address, and storage. Mention an outstanding check instead of claiming it passed. File storage uses `~/.aleo/accounts/<name>.json` unless another directory was selected. Tool credentials and swap recovery data remain in each tool's own directory; sharing an account does not share that recovery data.

If the request was only to create or import an account, stop here. Otherwise continue with basic setup below, including when this skill was invoked on its own. Creating or importing an account does not authenticate to Shield Swap, fund it, or authorize a trade.

## Show public balances on both networks

Use [public balance checks](references/public-balances.md) with the verified address. Check BAT, ZEC, USDG, USDCX, ETH, wBTC, USDT, and SOL on mainnet and testnet before choosing a trading network or signing in. This step needs only the public address. It does not load a private key, register with the scanner, create an API token, or request funds.

Show every requested asset with its mainnet and testnet public balance. Display missing registry entries as **Not listed**, and failed reads as **Unavailable**, never zero. Use the asset contracts returned by each network's registry, including the underlying contract and any separate wrapper. Preserve their separate results when one is unavailable. Explain that these are public holdings and that private balances have not been checked yet. A zero public balance does not mean the account is unfunded.

## Connect the trading setup

Offer the next choice after showing the public balances:

```markdown
To see your private balances on mainnet and testnet, we need to connect your trading setup to Shield Swap and register your account with the Record Scanning Service. The scanner uses your view key to find your records; it can see those records but cannot spend your funds.

**How would you like to set up your trading tools?**

1. **Python**\
   Set up a Python project for this account.

2. **JavaScript or TypeScript**\
   Set up a Node project for this account.

3. **Another language**\
   Tell me which language or framework you want to use.

4. **Use my existing setup**\
   Point me to your project folder or connected trading tools.

Which option works for you?
```

Keep a language or project the person already selected. The tool used to create the account does not determine their trading language. Selecting a new-project option after this explanation authorizes basic configuration, API sign-in, and scanner registration. Do not ask for that same permission again. If they only identify an existing project, inspect it and explain any missing setup before registering a new scanner or changing its configuration.

Use [connect trading tools](references/trading-setup.md) for the selected path. Explain that setup checks both networks; this does not choose a trading network. For an existing application bound to one network, keep its configuration and check the other network separately with the same account when authorized. Record an unchecked network as unknown if it cannot be checked. A path containing old state is a reason to verify its public address and network, not evidence that it belongs to another account.

Authenticate to the Shield Swap API, register the account with the Record Scanning Service, and wait for scanning to catch up before reporting private balances. Retain the same account name, address, and recovery state. Report API access and scanner progress separately; registration alone does not prove that private balance scanning is complete. Do not print signatures, view keys, session credentials, or record contents.

## Offer the next step

Show public and private balances separately, grouped by network. If scanning is pending or unavailable, say so and ask whether the person already has funds on mainnet. Keep any positive holdings found, but do not classify an incomplete check as an empty account. Zero means no balance in the assets successfully checked, not proof that the account holds no other assets.

When mainnet funds are present, confirm that they want to use those funds. Continue a task already selected; otherwise re-offer the main choices:

```markdown
Your account has funds on mainnet. Would you like to use them there?

1. **Trade now**\
   Choose a swap.

2. **Connect trading tools**\
   Use this account with your terminal, bot, or app.

3. **Build a strategy**\
   Build and test a trading workflow.

4. **Explore markets**\
   Look at assets, pools, and quotes.
```

If funds are public only, explain that they need to be made private before a private trade. Do not label public holdings as ready to trade. If no mainnet funds were found, ask once whether they have mainnet funds in another asset or account; preserve an answer already given. Do not repeat that question beneath the funding menu.

When neither network has funds in the checked assets, show these choices:

```markdown
1. **Bridge assets to Aleo mainnet from Ethereum or Solana**

2. **Get Testnet Aleo funds from the Aleo faucet**\
   Testnet assets are for practice.
```

The faucet option refers to testnet ALEO funds. Keep it separate from a Shield Swap test-token airdrop.

When testnet has funds and mainnet has none, offer **1. Bridge assets to Aleo mainnet from Ethereum or Solana** or **2. Trade on testnet**.

If a balance check is incomplete, offer to finish that check or use a network with verified funds. Do not recommend another deposit merely because scanning is behind.

Preserve a trading task already selected instead of asking for it again. These menus offer a next action; displaying them does not execute it. When someone chooses bridging, the Aleo faucet, or receipt of existing funds, invoke the `aleo-funding` skill. Pass the verified Aleo address as the default recipient, account name, chosen funding option, requested network, project, programming language, execution interface, signer, observed balances, scanner status, and original trading task. Preserve that language through wallet creation and bridging; a Python setup continues with the native Python bridge SDK. The funding skill should not ask them to recreate the account or re-enter that address. Selecting a faucet skips its EVM wallet menu.

The main Shield Swap package bundles `aleo-funding/SKILL.md`; its calling agent can load that entrypoint directly. For independently installed account setup, discover the `aleo-funding` skill by name. If it is absent, install the companion from `ProvableHQ/shield-swap-agent-kit` with `npx skills add ProvableHQ/shield-swap-agent-kit --skill aleo-funding`, following the person's existing agent-installation scope. Do not assume a sibling file exists in a standalone install. Until the companion is available, retain the setup context and report that the selected funding journey still needs it; do not substitute the combined CLI setup command.

Return the account name and address, project or connected tools, API and scanner status for each checked network, separate public and private holdings, and the chosen next action to the calling agent. Standalone use reports the same results and choices. Call basic setup complete only when the selected application can load the account, authenticate, and read private balances on the requested networks; describe any outstanding check otherwise.
