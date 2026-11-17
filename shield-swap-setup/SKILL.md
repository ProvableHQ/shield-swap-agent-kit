---
name: shield-swap-setup
description: Use when a user needs an Aleo account for Shield Swap tools, wants to create one, import an existing private key or recovery phrase, choose or change how the key is stored, or move a key out of state.json or profile.json, and when a tool reports ACCOUNT_NOT_FOUND, NEEDS_CONFIG_DECISION, KEY_NOT_STORED or PASSWORD_REQUIRED.
---

# Set up an Aleo account for Shield Swap

Walk the user through getting an Aleo account that every Shield Swap tool can use. One account file serves the Shield Swap CLI, Veil scripts, and the Python SDK: `~/.aleo/accounts/<name>.json`, where `<name>` defaults to `default`. Set it up once with any of them and the others find it.

## How to guide

- **Do the work.** Run every command that involves no secret yourself and tell the user what it did. Hand the user a command only when it has to read a key, a recovery phrase, or a password from them.
- **Ask only what is open.** Step 2 holds one message with both choices, what each one means, and what happens next, so the user answers once.
- **Say where things stand** after each step: what exists now, and what comes next.
- **Keep secrets out of the conversation.** The user types a key, phrase, or password at a hidden prompt in their own terminal, or saves it in a file there. If one is pasted into the chat anyway, do not use or repeat it. Explain that the conversation history now holds it, suggest a new account if it protects real funds, and carry on with the import in their terminal.

The account needs `@provablehq/shield-swap-cli` and `@provablehq/veil-aleo-sdk` 0.17.0 or later, or `aleo-sdk` and `shield-swap-sdk` 0.9.0 or later. If `shield-swap account --help` or `python -m aleo.keystore --help` reports an unknown command, upgrade the package first.

The commands below use the Shield Swap CLI. In a Python project, use `python -m aleo.keystore` in place of `shield-swap account`; its commands and options match unless a step shows a Python line of its own.

## 1. Look for an account

Run this yourself:

```sh
shield-swap account show --json
```

It prints the name, address, storage type, and file path, never the key. Add `--name <name>` for an account other than `default`. Exit status 2 with `ACCOUNT_NOT_FOUND` means there is none yet.

- **An account exists.** Show the user its address and ask whether to use it. If they agree, go to step 5. If its storage is `plaintext` on a Mac, first offer to move it into Keychain; see [Change protection later](#change-protection-later).
- **A tool warns that the key is still in `state.json` or `profile.json`.** Go to [Change protection later](#change-protection-later).
- **No account.** Continue with step 2.

A key supplied through `ALEO_PRIVATE_KEY` or `ALEO_PRIVATE_KEY_FILE` is used for that run in place of the account file and is never saved. A user whose key already arrives that way, for example from a secret manager, needs no account file.

## 2. Ask the two choices

When both choices are open on a Mac, send this message as written. The variations under it give the exact wording for every other case.

> **Set up your Aleo account**
>
> Your account is the address that holds your funds and the key that signs your trades. Nothing exists yet. Two choices from you and it's ready.
>
> **1. Which account?**
> - **New**: I create a fresh account now. It starts empty, and funding it is the next step.
> - **Existing**: you already have an Aleo account. You paste its key at a hidden prompt in your own terminal, so it never passes through this chat. Its address and funds stay as they are.
>
> **2. Where should the key be kept?**
> - **Keychain** (strongly recommended): in your Mac's Keychain. No password to remember and nothing extra to type, and the key never sits in a file that a backup, a synced folder, or another program could copy.
> - **File**: unencrypted, in a file only your user account can read. Anyone who gets a copy of that file can spend from the account. You can move it into Keychain later with one command.
>
> Reply with one of each, for example **new, keychain**. If you only answer the first, I'll use the file.
>
> After that I'll show you the account's address, then we sign in to Shield Swap and fund it.

Variations:

- **The request already answered one question.** Leave that question out, drop the numbers, and write "One choice" for "Two choices". Where the question stood, name the answer taken: "Creating a new account, as you asked." or "Importing your existing account, as you asked. You paste its key at a hidden prompt in your own terminal, so it never passes through this chat." Close with "Reply **keychain** or **file**. If you don't choose, I'll use the file." or with "Reply **new** or **existing**."
- **Off macOS** (when unsure, `uname -s` prints `Darwin` on a Mac), Keychain is not available. Replace that option with "**Encrypted** (recommended): locked with a password you choose, so a copy or backup of the file stays locked. The password is needed on every run, typed at a prompt or supplied through `ALEO_ACCOUNT_PASSWORD`." End the File option with "You can encrypt it later with one command." The reply words become **encrypted** and **file**.

Rules:

- **Wait for the account answer.** An empty machine does not show that the user has no account elsewhere, so never choose New for them.
- **Recommend once.** A wish stated before this message, such as "whatever is fastest" or "no passwords", does not answer the storage question: still show it. On a Mac, Keychain meets both wishes. If the user then picks File, answers only the first question, or repeats that they want the fastest path, use the file and move on. Do not ask again.
- **When nobody is present to answer**, create nothing unless the caller already chose New. Use the storage the caller specified, otherwise the file, and include the recommendation in the result.

## 3. What the storage choices mean

The key is saved unencrypted unless the user chooses otherwise. Use this table to answer follow-up questions and to pick the `--storage` value in step 4.

| Choice | `--storage` | Where the key is kept | What each later run needs |
| --- | --- | --- | --- |
| Keychain (strongly recommended on macOS) | `keychain` | In macOS Keychain. The account file holds a reference, so copying the file does not copy the key. On a logged-in Mac no dialog appears when these tools save or read it. | Nothing. |
| Encrypted (recommended elsewhere) | `encrypted` | Encrypted in the account file. A copy or backup stays locked. | The password: a hidden prompt, or `ALEO_ACCOUNT_PASSWORD`. |
| File (the default) | `plaintext`, or no flag | Readable in the account file, which only its owner can open. | Nothing. Anyone who can read the file can spend from the account. |

An unattended service cannot answer a prompt. With an encrypted account it reads `ALEO_ACCOUNT_PASSWORD`, set from the service's secret store. That keeps copies and backups of the account file locked, but someone who can read the service's environment can read the password too.

## 4. Create or import the account

`trading` is an example name. Omit `--name` to use `default`.

**New account, Keychain or unencrypted.** Run it yourself. Nothing secret is typed or printed:

```sh
shield-swap account create --name trading --storage keychain
shield-swap account create --name trading                       # unencrypted
python -m aleo.keystore create --name trading --storage keychain    # the same, in a Python project
```

**Existing account.** The user runs the import in their own terminal and pastes the key or recovery phrase at the hidden prompt:

```sh
shield-swap account import --name trading --storage keychain
```

If the user prefers, they save the key in a file themselves and tell you the path. Then you run `shield-swap account import --name trading --storage keychain --key-file <path>` and remind them to delete the file, which the import leaves in place.

**Password-encrypted account.** The user runs `create` or `import` with `--storage encrypted` in their own terminal and chooses the password at the prompt. An unattended service then reads the password from `ALEO_ACCOUNT_PASSWORD`, set from its secret store.

Creating or importing an account does not contact the network, sign in to Shield Swap, or move funds. A name that already holds another account is refused with `ACCOUNT_EXISTS`: pick another name and leave the existing file alone.

A Veil project without the CLI creates the account with a one-off script, run with `npx tsx create-account.mts`:

```ts
import { generateAccount } from '@provablehq/veil-aleo-sdk'
import { saveAccount } from '@provablehq/veil-aleo-sdk/node'

const stored = await saveAccount(generateAccount(), { name: 'trading', storage: 'keychain' })
console.log({ name: stored.name, address: stored.address, storage: stored.storage })
```

Afterwards, tell the user:

- the account's address and where its key is kept;
- for Keychain, that the key exists only in this Mac's Keychain, and that running `shield-swap account export --name trading` in their own terminal displays it once so they can save it in a password manager;
- for an unencrypted account, that one command moves it into Keychain whenever they like; see [Change protection later](#change-protection-later).

## 5. Connect the tool that will trade

| Tool | Select the account | What that does |
| --- | --- | --- |
| CLI | `shield-swap setup --network testnet --name trading` | Records the name and address in `.shield-swap/testnet/state.json`, signs in to Shield Swap, creates an API token if needed, and can request testnet funds. |
| Python | `profile = Profile.load_or_create(network="testnet", account="trading", create=False)`, then `ShieldSwap.from_profile(home=profile.home)` | Records the name and address in `profile.json`. With `create=False`, a missing account raises `ACCOUNT_NOT_FOUND` and no key is generated. |
| Veil | `const { account } = await loadAccount({ name: 'trading' })`, then `createAleoClient({ privateKey: account.privateKey })` | Nothing on disk. The key is found again on each run. |

Use the network the user trades on in place of `testnet`, and leave the name out for the account named `default`.

The key stays in the account file or Keychain. API tokens and swap recovery data stay in each tool's own folder, so a swap is claimed with the tool that made it. Signing in to Shield Swap and funding the account are the next steps and are not part of this skill. The AgentKit MCP server keeps a separate encrypted store, set up with `shield-swap-mcp setup --guided`.

## Change protection later

Both commands keep the address and funds. Run the first yourself; it needs no secret:

```sh
shield-swap account protect --name trading --storage keychain
shield-swap account protect --name trading --storage encrypted    # the user runs this and chooses a password
```

A key that an older release left in a CLI state file or a Python profile moves into an account file with:

```sh
shield-swap account migrate --network testnet --storage keychain --remove-legacy-key
python -m aleo.keystore migrate --from ~/.shield-swap/profile.json --storage keychain --remove-legacy-key
```

Without `--remove-legacy-key` the readable key stays in the old file, so protecting the new account file protects nothing.

## When a command stops

| Code | What happened | What to do |
| --- | --- | --- |
| `ACCOUNT_NOT_FOUND`, `NEEDS_CONFIG_DECISION` | No account has that name and no key was supplied. | Start at step 2. |
| `PASSWORD_REQUIRED`, `TERMINAL_REQUIRED` | The command needs a password or a terminal. | The user runs it in their own terminal, or sets `ALEO_ACCOUNT_PASSWORD`. |
| `WRONG_PASSWORD` | The password does not unlock the account. | The user tries again. Without it, only a saved copy of the key or phrase restores the account. |
| `KEYCHAIN_UNAVAILABLE` | Keychain storage was asked for outside macOS. | Use `encrypted` or the default. |
| `KEY_NOT_STORED` | The account file records an address without a key. | The user supplies the key on each run through `ALEO_PRIVATE_KEY_FILE`. |
| `ADDRESS_MISMATCH` | The key found belongs to a different address than the tool's folder was set up for. | Check `--name`, `ALEO_ACCOUNT`, `ALEO_PRIVATE_KEY`, and `ALEO_PRIVATE_KEY_FILE`. Keep the existing folder. |
