---
name: aleo-funding
description: Fund an Aleo account or build reusable funding scripts. Guide a bridge transfer, receipt on Aleo, or the testnet faucet; set up scripts using Privy, Dynamic, a local account, or a deposit wallet.
---

# Fund your Aleo account

Help someone fund their Aleo account now or set up scripts they can run themselves. Keep the conversation on the current choice and use this skill's bundled instructions and helpers. Funding does not select a swap or start a strategy.

## Explain what happens to the funds

Write guided funding for someone making their first bridge transfer. Explain bridging as moving funds from another network into their Aleo account. At each decision, explain what they send, where it goes, and what they should expect next. Use the asset and network names they will see in their wallet or exchange. Introduce only the detail needed for the current choice.

Keep registry lookups, route IDs, signer adapters, checkpoints, and SDK checks in the agent's working instructions. Tell the person the result that affects them: whether the transfer is available, what it costs, what they receive, or why it must wait. A catalog entry alone does not establish current availability. Give implementation detail when they ask for it, need to diagnose a problem, or choose programmatic funding.

For a deposit wallet, explain the two actions: they send funds to a wallet created for this transfer, then authorize bridging from that wallet to Aleo. The initial deposit still leaves their funds on the sending network. Explain where the wallet's private key is stored and who can use it before they fund it. Choose the network and asset to give correct deposit instructions and calculate fees; do not describe the wallet itself as limited to one network or asset.

Once the transfer is selected, name the asset they will receive on Aleo, including any change in its name. Explain network fees as the cost of processing the transfers, and show the amount needed for those fees. Before approval, state whether the funds arrive as a public balance or a confidential balance and any further step needed for confidential trading. The sending-network transfers remain public. Preserve those facts without turning each prompt into a protocol tutorial.

## Keep the setup context

When account setup calls this skill, retain the verified Aleo address, account name, network, chosen funding option, project, programming language, execution interface, signer, scanner status, latest public and private balances, and intended trading task. Also retain whether the person wants a guided transfer or funding scripts. Show the destination address and allow a correction without making someone type it again. Preserve an existing wallet connection and authorization.

Use the selected language for both guided funding and script setup. Python uses [native Python funding](references/python-funding.md) and the latest `aleo-bridge-sdk` from PyPI; JavaScript/TypeScript uses the Veil recipes and `.mjs` helpers. An EVM or Solana account has no programming language: changing the tool must not generate a replacement account. Keep the selected Aleo account and any existing source wallet.

For another language, first check the project's existing bridge integration and supported SDK capabilities. If a required capability is missing, explain that specific gap and let the person choose a supported integration before adding another runtime. Do not automatically create a JavaScript project, Node wrapper, or new Aleo profile because this skill includes JavaScript examples. Reuse a previously accepted fallback.

As soon as bridging is selected, [establish the working project and language](references/working-context.md) for either a guided transfer or funding scripts. Reuse a confirmed setup; otherwise suggest relevant projects from the conversation or available history and ask for the missing folder or language. Resolve this before installing dependencies, writing or copying scripts, creating a bridge wallet, or asking for a deposit. A wallet or transfer choice does not select a JavaScript runtime or a project folder.

For standalone use, resolve the default through the SDK's account priority and enumerate other saved Aleo accounts using [account discovery](references/aleo-accounts.md). An address explicitly selected by the person or passed from setup stays selected. Show every discovered account by name and public address, with the selected account first, and offer another Aleo address. Ask for a public address only when none is available or the person chooses another one. Resolve the network before moving funds. Mainnet bridging and the Aleo testnet faucet are different paths.

If a funding method was already selected, keep it and omit Step 2. A request for scripts that fund Aleo from an EVM or Solana wallet already selects bridging and the scripts path. A faucet selection, including the setup label **Get Testnet Aleo funds from the Aleo faucet**, goes to [testnet funding](references/receive-and-faucet.md#aleo-testnet-faucet) after identifying the receiving account. Skip EVM balance checks and source-wallet setup. For receipt of funds already on Aleo, use [receive on Aleo](references/receive-and-faucet.md#receive-assets-already-on-aleo).

## Choose the account and funding method

Use the same portable, separated sections as account setup. Bold option names, short descriptions, and blank lines work in both chat and terminals. Avoid boxes and aligned text columns. Render the templates as Markdown, without the surrounding code fence.

When an account is available and the funding method is still open, show:

```markdown
**Step 1: Choose an Aleo account to fund**

I'll use **ACCOUNT_NAME** unless you choose another account.

- **A. ACCOUNT_NAME · Selected by default**\
  ALEO_ADDRESS

- **B. OTHER_ACCOUNT_NAME**\
  OTHER_ALEO_ADDRESS

- **C. Another Aleo address**\
  Send the address you'd like to fund.

---

**Step 2: Choose how to fund it**

1. **Bridge assets to Aleo for private trading**\
   Bridge assets you want to trade privately on Aleo from Base, Ethereum, Arbitrum, Arc, or Solana.

2. **Send Aleo testnet funds from the Aleo faucet for testing**\
   Airdrop funds to an Aleo wallet to test trading or liquidity strategies on Aleo testnet.

3. **Receive funds already on Aleo**\
   Send funds to your Shield Swap account from another Aleo wallet or an exchange to the address above.

4. **Build programmatic funding**\
   Create reusable funding scripts with Privy or Dynamic, a local account, or a new EVM or Solana wallet you fund.

---

Reply **1**, **2**, **3**, or **4** to use the selected account, or include an account letter, such as **B4**.
```

Option 4 selects the scripts path directly. Keep the selected Aleo account, resolve any missing [working context](references/working-context.md), then show [the funding-script wallet choices](#set-up-funding-scripts) as Step 3. Skip the guided-transfer-or-scripts question and the guided deposit instructions. Do not require a funded source wallet or a live transfer to complete script setup.

Populate the account list from the discovered accounts; the two rows above are examples, not a limit. Use consecutive letters and keep **Another Aleo address** last. Show full verified addresses, never invented alternatives or only a sentence saying other accounts exist. If several names share an address, show their names together without duplicating the destination. An account supplied by a connected wallet or the environment can be listed with that source as its label when it has no saved name. “Selected by default” marks the active choice; it does not mean the account must be named `default`.

If no account can be resolved, show Step 1 and ask, “Which Aleo address would you like to fund?” Retain any funding choice already given. If alternatives exist but the SDK-selected account is unavailable, list them without silently promoting the first one. With a selected funding method, show the account list without requiring another confirmation of an account already explicitly chosen, then continue that method. Account files are network-neutral; bridging targets mainnet, the faucet targets testnet, and a direct receipt keeps the requested network or asks which network to use.

## Choose a guided transfer or funding scripts

After mainnet bridging is selected and the working context is resolved, offer this choice if the intent is still unclear. Choosing **Build programmatic funding** in the opening menu goes directly to the scripts path without this question. A request to write scripts or build a funding integration also selects the scripts path; an explicit request to carry out a transfer now selects the guided path. A general choice of “bridge” does not settle this question.

```markdown
**Step 3: Choose how you'd like to bridge**

1. **Fund my account now**\
   Get help choosing a wallet, reviewing fees, and completing a bridge transfer.

2. **Set up my own funding scripts**\
   Create scripts to fund your Aleo account from Privy or Dynamic, a local account, or a new wallet you send funds to.

---

Which option would you like to use?
```

For scripts, continue to [set up funding scripts](#set-up-funding-scripts). For a guided transfer, continue to [review funds and choose a wallet](#review-funds-and-choose-a-wallet). Keep these as separate paths; script setup does not require a deposit or live transfer. Number subsequent steps for the path actually shown, omitting questions already answered.

## Set up funding scripts

Offer these choices only on the scripts path, retaining a provider or custody choice already supplied:

```markdown
**Step 3: Choose a wallet for your scripts**

1. **Use Privy or Dynamic**\
   Connect a wallet managed through your Privy or Dynamic app.

2. **Use a local account**\
   Use an account you manage, or create one on this computer with its private key stored securely.

3. **Create temporary wallet to complete the bridging**\
   Create a temporary local EVM or Solana wallet, send assets to it from your wallet or exchange and use it to bridge funds to Aleo.

---

Which option would you like to use?
```

Follow [build the funding scripts](references/funding-scripts.md). Use the existing project and language; ask where to put the scripts only if that is unknown. Ask Privy or Dynamic only after that choice is selected. A local account can already hold funds; the deposit-wallet path creates a dedicated receiving wallet and includes commands to check arrivals before bridging. Both retain credentials and recovery state across runs.

When a source address is already known, read its relevant public balances automatically; otherwise skip the check. An existing funded wallet is not a requirement for writing scripts. Do not ask for a deposit as part of script setup. Finish with the created files, exact run commands, checks performed, and any remaining provider or credential setup. Return `funding scripts prepared` and the actual funding status to the calling skill; do not proceed through the guided transfer steps unless the person also asks to fund now.

## Review funds and choose a wallet

On the guided bridge path, read the selected Aleo account's balances on the target network and automatically check relevant assets for any known source wallets before presenting Step 4. Follow [balance inspection](references/balances.md), preserving the selected language. Use public addresses already supplied in the conversation, available from the existing setup, or found in saved wallet metadata. Do not make these reads wait for “Check saved wallet.” If no source address is known, skip source balance checks and omit that section; do not stop to ask for an Ethereum address.

When the selected Aleo account has an existing trading setup, automatically read and show its private balances. Reuse the setup's account and record access, reconnecting through its saved configuration if needed. Balances just returned by setup can be shown directly if still current. Do not default a configured account to “Private balances: Not checked.”

Show the balances, supported asset/network pairs, and funding-wallet options together in one Step 4 response. Use these separated sections, replacing the placeholders with observed results. Show only nonzero amounts, with public and private Aleo balances labeled separately. Keep failed or unchecked reads visible as status text. Repeat the saved-wallet section for each distinct wallet found. If a funding wallet has already been selected, retain it and continue to the next missing choice after showing the balances.

Include **Assets you can send** even when no source wallet is known. Build the list from the [supported routes](references/bridge-transfer.md#choose-the-route), showing each sending asset and network and what arrives on Aleo. Put pairs matching known holdings first, then the other supported choices. This helps the person choose what to send from a wallet or exchange; it does not require sharing another address.

```markdown
**Step 4: Choose a funding wallet**

**Your Aleo account**

Account: ACCOUNT_NAME\
Network: Aleo TARGET_NETWORK\
Address: ALEO_ADDRESS

- AMOUNT ASSET · Private balance
- AMOUNT ASSET · Public balance

---

**Saved bridge wallet**

Address: SOURCE_ADDRESS

- AMOUNT ASSET · SOURCE_NETWORK
- GAS_AMOUNT GAS_ASSET · SOURCE_NETWORK · Available for network fees

Previously set up to fund: SAVED_RECIPIENT_NAME_OR_ADDRESS

---

**Assets you can send**

- **SOURCE_ASSET on SOURCE_NETWORK** → DESTINATION_ASSET on Aleo

---

**How to supply the funds**

1. **Use the saved bridge wallet**\
   Use SOURCE_ADDRESS to bridge funds to SELECTED_ALEO_ACCOUNT.

2. **Create a bridge address for me**\
   A local EVM or Solana wallet that you own is created and stored locally and used to bridge funds to Aleo. I will use the funds you send to this wallet to bridge funds to Shield Swap.

3. **Set up my own funding scripts**\
   Set up funding from Privy or Dynamic, a local account, or a new deposit wallet.

---

Which option would you like to use?
```

This is a layout, not sample balance data. Omit zero-amount bullets. Summarize successful empty reads as “No nonzero private balances found in the checked assets” or “No nonzero public balances found in the checked assets,” as applicable. If private access is missing, locked, still syncing, or fails, state that reason in place of the private amounts. Public zeros do not establish that private balances are empty. Keep unavailable assets separate from verified holdings.

If a saved wallet's recipient differs from the selected Aleo account, say: “This wallet was previously set up to fund **SAVED_RECIPIENT**. Your selected receiving account is **SELECTED_RECIPIENT**.” Reading its balances does not change that recipient or reuse a pending transfer. Its saved status, such as “awaiting deposit,” is historical context, not evidence of current holdings. Keep technical state details out of the menu.

Add one scope line after the results: “These checks cover supported assets and network fees, not every asset in a wallet.” For EVM wallets, check Base, Ethereum mainnet, Arbitrum, and Arc even when the saved task used only one. On Arc, show USDC once as both bridge funds and gas. Read an already supplied source address alongside saved wallets, deduplicating repeated addresses, and label it **Your source wallet** if it is not a saved bridge wallet. Omit the previous-recipient line when none is known. An address supplied for inspection does not establish control of that wallet.

Repeat the asset-pair bullet for each supported choice, grouping pairs by source network when the list is long. For Base or Arbitrum USDC, add “via Arc” and explain once that both transfers have fees. Keep the separate recovery state internally. ETH on either L2 pays that network's transaction fees; do not list it as an asset that can be bridged through the USDC path.

Ask only for the funding-wallet choice, without a separate **Continue**, **Skip**, or “Check another wallet” prompt. If the person supplies another source address, read its relevant balances and keep the selected Aleo recipient unchanged. Do not repeat a choice the person has already made.

Every saved bridge wallet shown as a funding source needs a matching **Use the saved bridge wallet** choice before the new-address option. For several wallets, identify each choice by name or shortened address. Omit this choice when none is saved and renumber the menu. Missing gas does not remove the choice: add a short note such as “Needs ETH on Ethereum for network fees.” Selection proceeds to [reuse the saved wallet](references/local-wallets.md#reuse-a-saved-wallet); it does not create another address or submit a transfer. If access is known to be blocked, state what needs restoring. An unresolved transfer must be recovered before preparing another one.

When another usable wallet connection exists, add **Use CONNECTED_WALLET_NAME** before the new-address option, with its verified address and how approval happens. This can be a browser or hardware wallet through a supported integration, or an already configured local or hosted signer. Deduplicate it against saved-wallet choices and renumber the options. Never call an inspected public address a connected wallet. If someone asks to use a wallet without an available connection, explain the missing integration and offer sending from it to the deposit wallet or building that integration. Do not ask them to export its private key.

Read [local wallets and deposit addresses](references/local-wallets.md) when **Create a bridge address for me** is selected. This asks the agent to create the wallet with the helper for the selected language after the network and asset are chosen: `local_wallet.py` for Python, `local-wallet.mjs` for JavaScript/TypeScript. The person supplies funds to the resulting address; do not ask them to create the wallet themselves. The scripts choice switches to [set up funding scripts](#set-up-funding-scripts), preserving the account, source address, and any selected route. New provider integration belongs on that path. The bridge SDK connects signers; Privy and Dynamic provision their own wallets. Do not describe their server adapters as a consumer email-login flow.

For a new deposit address, choose the **source network and asset first**. Use a supported [route](references/bridge-transfer.md#choose-the-route), then create the wallet. Keep its credential and recovery state through delivery and any return of leftover funds, even when it is used for only this transfer. Store it persistently across terminal sessions.

At this choice, use this exact wording:

```markdown
To fund your account, a temporary wallet (that you retain the keys to) will be created locally and the corresponding address will be provided here. Sends funds to this address from your existing wallet, and these funds will be subsquently be bridged privately to your Aleo account

Specify the funds and network it's on to bridge these to your private Aleo balance.
```

Here, temporary describes the wallet's use for this transfer. Retain its keys and recovery state; do not make it expire or delete it after bridging. Treat a private Aleo balance as the intended outcome. Before requesting a deposit, verify that the selected asset can reach that balance, directly or through a supported conversion, and explain any additional step and fee. Describe the destination balance as private only when supported; the sending-network transfers remain public.

Ask only for the missing choice. If balances are already known, offer the supported asset/network pairs from those holdings. Explain any intermediate network and estimate the costs of both funding the deposit wallet and bridging before asking for a deposit. Keep the transfer review and authorization before execution. Check current availability internally; do not introduce the choices with a description of the installed registry.

For Solana, offer a public source address once that path is selected. Check SOL for fees and the exact mint for a token deposit. Do not imply that the EVM address check includes Solana.

## Give clear deposit instructions

After verifying the new wallet can be loaded in a separate process and arranging its backup, show:

```markdown
**Send funds to your deposit wallet**

Network: SOURCE_NETWORK\
Asset: SOURCE_ASSET\
Address: DEPOSIT_ADDRESS

Send TRANSFER_AMOUNT, plus GAS_INSTRUCTIONS.

Final destination: ALEO_ADDRESS on Aleo mainnet.

This sends funds to your deposit wallet on SOURCE_NETWORK. Once they arrive, I'll show the fees and expected amount on Aleo before you approve the bridge transfer.
```

Fill the amounts and gas instructions from the selected route and current estimate. ERC-20 deposits need native gas in the same wallet: ETH on Ethereum, Base, or Arbitrum. Solana tokens need SOL. Arc uses USDC for gas, so reserve some of the same balance. Native ETH and SOL transfers also need a fee reserve. Do not quote a fixed gas top-up as a guarantee.

An exchange withdrawal must use the named chain and exact supported token. Do not send arbitrary assets to a deposit address, and never use a bridge contract as the deposit address. Confirm the intended asset arrived and the wallet can pay gas before quoting the final amount. A matching balance is not evidence of who sent it; do not automatically spend unrelated arrivals.

## Review and follow the transfer

Use [native Python funding](references/python-funding.md#quote-execute-and-recover) for Python, or [bridge transfer and recovery](references/bridge-transfer.md) for JavaScript/TypeScript. Present the source wallet, network, asset and amount, final Aleo address, route, estimated receipt, fees, gas reserve, and whether delivery is public or confidential. For a route through Arc, include its intermediate wallet and both transfers. Explain any required Aleo fee funding before a source deposit.

Ask for approval of that concrete transfer unless it is already authorized with the same details and limits. Creating a wallet, reading balances, or selecting “bridge” does not authorize an unspecified amount. Keep an existing authorization instead of repeatedly asking for the same approval. Requote when the amount or fee limit changes materially; do not silently increase it.

Persist the transfer intent before submission and SDK checkpoints as they arrive. An unknown submission outcome requires inspecting the original transaction. Do not generate another wallet, quote a replacement transfer, or submit again to make a pending deposit appear faster. Keep each leg of a route through Arc separate and complete the first before funding the second.

## Finish a guided transfer at usable funds

Report source submission, bridge delivery, and Aleo balance verification separately. Hyperlane delivery and public USDCx mints can leave public balances. A confidential balance may require a separate authorized conversion with Aleo fees. A completed bridge is not proof of spendable records, and a delayed scanner is not a reason for another deposit.

Describe progress by where the funds are, using only verified results: received in the deposit wallet, transfer to Aleo submitted, or received on Aleo. If delivery is pending, say what is still waiting and whether the person needs to act. Do not read out internal state names or claim the funds are available for trading before checking that they are usable.

For a destination owned by the current setup, use its existing signer and scanner to verify the received asset. For an address someone supplied without wallet access, report confirmed public delivery or the provider's tracking result and the verification still needed. Do not request the recipient's private key to complete that check.

Keep the deposit wallet and checkpoints. Offer to return leftover assets to an address the person confirms, with the fee shown before sending; never infer a refund address from an exchange withdrawal sender. Do not sweep or delete a wallet automatically.

Return the Aleo address/network, funding method, source wallet and network, asset and observed amount, transaction identifiers, recovery location, delivery status, public/confidential balance status, and any outstanding fee or scanner requirement to the calling setup skill. Resume the trading task already chosen when funds are usable. Otherwise offer the main choices: trade, connect trading tools, build a strategy, or explore markets. A faucet request or bridge deposit by itself is not completion.
