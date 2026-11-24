---
name: aleo-funding
description: Fund an Aleo account or add funding to a project. Guide a bridge transfer, receipt on Aleo, or the testnet faucet; build app or bot integrations, reusable functions, scripts, CLIs, or a funding UI using the project's wallet setup.
---

# Fund your Aleo account

Help someone fund their Aleo account now or build funding into their project. Keep the conversation on the current choice and use this skill's bundled instructions and helpers. Funding does not select a swap or start a strategy.

## Explain what happens to the funds

Write guided funding for someone making their first bridge transfer. Explain bridging as moving funds from another network into their Aleo account. At each decision, explain what they send, where it goes, and what they should expect next. Use the asset and network names they will see in their wallet or exchange. Introduce only the detail needed for the current choice.

Keep registry lookups, route IDs, signer adapters, checkpoints, and SDK checks in the agent's working instructions. Tell the person the result that affects them: whether the transfer is available, what it costs, what they receive, or why it must wait. A catalog entry alone does not establish current availability. Give implementation detail when they ask for it, need to diagnose a problem, or choose programmatic funding.

For a deposit wallet, explain the two actions: they send funds to a wallet created for this transfer, then authorize bridging from that wallet to Aleo. The initial deposit still leaves their funds on the sending network. Explain where the wallet's private key is stored and who can use it before they fund it. Choose the network and asset to give correct deposit instructions and calculate fees; do not describe the wallet itself as limited to one network or asset.

Once the transfer is selected, name the asset they will receive on Aleo, including any change in its name. Explain network fees as the cost of processing the transfers, and show the amount needed for those fees. Inbound bridging includes preparing a confidential balance: if delivery is public, shield the received amount automatically; if delivery already creates private records, do not shield it again. Include any shielding transaction and Aleo fee in the original transfer review and authorization. Do not offer shielding as an optional follow-up or ask for separate permission to perform it. The sending-network transfers and any intermediate public Aleo balance remain public. Preserve those facts without turning each prompt into a protocol tutorial.

Before requesting a deposit or submitting the bridge, verify that the asset can reach a confidential balance, that the required recipient signer is available, and that Aleo fees or sponsorship cover completion. Resolve missing prerequisites before moving funds; do not silently fall back to public-only delivery. Shield only the amount attributable to this bridge, keeping any required fee reserve. This applies to guided inbound transfers and integrations built by this skill.

## Keep the setup context

When account setup calls this skill, retain the verified Aleo address, account name, network, chosen funding option, project, programming language, execution interface, signer, scanner status, latest public and private balances, and intended trading task. Also retain whether the person wants funding guidance or a build. Show the destination address at account selection and allow a correction without making someone type it again. Preserve an existing wallet connection and authorization.

Use the selected language for both guided funding and script setup. Python uses [native Python funding](references/python-funding.md) and the latest `aleo-bridge-sdk` from PyPI; JavaScript/TypeScript uses the Veil recipes and `.mjs` helpers. An EVM or Solana account has no programming language: changing the tool must not generate a replacement account. Keep the selected Aleo account and any existing source wallet.

For another language, first check the project's existing bridge integration and supported SDK capabilities. If a required capability is missing, explain that specific gap and let the person choose a supported integration before adding another runtime. Do not automatically create a JavaScript project, Node wrapper, or new Aleo profile because this skill includes JavaScript examples. Reuse a previously accepted fallback.

At the project step of the selected bridge path, [establish the working project and language](references/working-context.md). Reuse a confirmed setup; otherwise suggest relevant projects from the conversation or available history and ask for the missing folder or language. Resolve this before installing dependencies, writing or copying scripts, creating a bridge wallet, or asking for a deposit. A wallet or transfer choice does not select a JavaScript runtime or a project folder.

When the selected path reaches account selection, resolve the default through the SDK's account priority and enumerate other saved Aleo accounts using [account discovery](references/aleo-accounts.md). An address explicitly selected by the person or passed from setup stays selected. Show every discovered account by name and public address, with the selected account first, and offer another Aleo address. Ask for a public address only when none is available or the person chooses another one. Resolve the network before moving funds. Mainnet bridging and the Aleo testnet faucet are different paths.

If a funding method was already selected, retain it in the chosen path instead of asking again. A request to build Aleo bridge funding into an app, bot, module, script, CLI, or web UI selects bridging and the build path. A faucet selection, including the setup label **Get Testnet Aleo funds from the Aleo faucet**, goes to [testnet funding](references/receive-and-faucet.md#aleo-testnet-faucet) after identifying the receiving account. Skip EVM balance checks and source-wallet setup. For receipt of funds already on Aleo, use [receive on Aleo](references/receive-and-faucet.md#receive-assets-already-on-aleo).

## Start with two choices

For a general request such as “funding,” show only this opening menu:

```markdown
**Which best describes your use case for bridging funds to Shield Swap?**

1. **Fund an account for private trading**\
   Get step-by-step help sending assets from Ethereum-compatible networks or Solana to Shield Swap and making them available for private trading.

2. **Add Shield Swap funding to an existing application or bot**\
   Integrate transfers between Shield Swap and Ethereum-compatible networks or Solana into your trading software, bot, or terminal UI.

Choose 1 or 2.
```

Keep account lists, balances, project questions, build options, wallets, and asset pairs for the selected path. Do not discover accounts, inspect projects, or run balance checks just to show this menu. Retain setup context without expanding it into an opening status report.

If the request or setup handoff already selects a path, skip this question. A request for a guided transfer, faucet funds, or receipt from another Aleo wallet selects guidance. A request for an app integration, functions, scripts, CLI, or funding UI selects building. Accept earlier labels such as **Build funding into my project** and **Build scripts I can run myself**. A bare “bridge” selects the funding method but leaves guidance versus building unresolved; keep that method while asking the two-choice question. Interpret numeric replies in the menu currently shown, not a previous menu.

After selection, follow only that path. Use portable Markdown with bold labels, short descriptions, blank lines, and separators. Show the current decision or a small related group of decisions; do not replace this short opening with another page containing every remaining menu. Preserve answered choices and ask only for what is missing. A calling bot can supply these choices directly.

## Funding guidance

Start with the account and funding method below. Reuse a selected account or method from setup; if both are known, continue to the relevant next action. Use [account discovery](references/aleo-accounts.md) only when account selection is needed.

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
   Send funds from another Aleo wallet or an exchange to the address above.

---

Choose an account and a funding option, or just the funding option to use the selected account.
```

Populate the account list with every discovered account, using consecutive letters and full verified addresses. Combine aliases for the same address; distinguish accounts with the same name in different directories. Mark a destination selected only when supplied by the person or resolved through the SDK. If selection is unresolved, replace the default sentence with “Choose an account below.” Briefly explain conflicts in plain language, keeping environment-variable names and loader details for diagnosis when requested. If no account is known, ask for its public address. Omit choices already resolved instead of asking again.

A faucet choice continues directly to [testnet funding](references/receive-and-faucet.md#aleo-testnet-faucet). Receipt from another Aleo wallet or exchange continues to [receive on Aleo](references/receive-and-faucet.md#receive-assets-already-on-aleo). Neither needs a project, source wallet, or bridge configuration.

For a guided bridge, continue with:

- **Step 3: Choose where to work.** Reuse or establish the project, language, or existing execution interface using [working context](references/working-context.md). Suggest relevant known projects when available. Resolve this before installing packages, writing files, creating a wallet, or asking for a deposit.
- **Step 4: Review funds and choose how to supply them.** Follow [review funds and choose a wallet](#review-funds-and-choose-a-wallet), showing known balances, supported asset/network pairs, and wallet choices together. Collect the selected pair and amount, then prepare deposit instructions or the transfer review as appropriate.

Do not show the five build options on this path. If the person switches to building, carry their selections into that path. Preserve any authorization for the same concrete transfer and limits.

## Build bridging into the application

Use [build funding into a project](references/funding-scripts.md) for this path:

- **Step 1: Choose what to build.** Present the five integration choices unless the request already specifies one.
- **Step 2: Tell me about your project.** Reuse the chosen folder and language. Establish what the project does, where funding fits, and its existing wallet setup using [working context](references/working-context.md#understand-the-integration). These first two steps can be shown together.
- **Step 3: Choose an Aleo account to fund.** Reuse the verified recipient from setup, or offer the account choices described under [funding guidance](#funding-guidance), labeling this Step 3. Do not include the faucet or receive-on-Aleo menu on the build path.
- **Step 4: Choose wallets and supported pairs.** Use [review funds and choose a wallet](#review-funds-and-choose-a-wallet) and the existing project integration. Ask “Which pairs should your project support? Choose one or more.” Show source network, source asset, asset received on Aleo, and any intermediate network. Current holdings can suggest pairs but do not limit the requested support. Amounts can be supplied when the integration runs.

Skip resolved decisions instead of replaying each menu. An app, functions, or web UI request must not become a CLI. For **Create a simple funding script or CLI**, clarify the form if the request or project does not establish it. Keep known wallet and pair choices; ask Privy or Dynamic only after that provider option is selected. No deposit or live transfer is required to finish building.

Finish with the chosen integration, changed files, usage instructions, checks performed, and any remaining provider or credential setup. Return the integration's form and location and actual funding status to the calling skill. If the person also asks to fund now, use the prepared integration for that separately authorized transfer.

## Preserve the selected path

Keep the receiving account/network, funding method, guidance-or-build choice, desired build form, project purpose and integration point, working project/language, source wallet, asset/network pairs, and transfer amount or limits in the journey context. Historical project suggestions and observed balances do not select a project or authorize spending. If a reply could refer to more than one choice, resolve that ambiguity before acting. A change of path retains compatible choices; a change of recipient or network refreshes affected balances without restarting the whole journey.

## Review funds and choose a wallet

At the funds-and-wallet step of either bridge path, read the selected Aleo account's balances on the target network and automatically check relevant assets for known source wallets. Follow [balance inspection](references/balances.md), preserving the selected language. Use public addresses already supplied in the conversation, available from the existing setup, or found in saved wallet metadata. Do not make these reads wait for “Check saved wallet.” If no source address is known, skip source balance checks and omit that section; do not stop to ask for an Ethereum address.

When the selected Aleo account has an existing trading setup, automatically read and show its private balances. Reuse the setup's account and record access, reconnecting through its saved configuration if needed. Balances just returned by setup can be shown directly if still current. Do not default a configured account to “Private balances: Not checked.”

Keep balances, wallet choices, and supported pairs together in Step 4 of the selected path. Show only nonzero holdings and actual read status. Include supported pairs even without a source wallet, putting pairs matching known funds first. Use this layout, adapting the descriptions to a guided transfer or the selected integration:

```markdown
**Available funds**

- **ACCOUNT_NAME on Aleo mainnet:** AMOUNT ASSET · Private balance
- **ACCOUNT_NAME on Aleo mainnet:** AMOUNT ASSET · Public balance
- **Saved bridge wallet · SOURCE_ADDRESS:** AMOUNT ASSET on SOURCE_NETWORK. GAS_STATUS

---

**Choose a funding wallet**

1. **Use the saved bridge wallet · SOURCE_ADDRESS**\
   Reuse the wallet already saved on this computer to bridge the funds it holds, or funds you send to it later.

2. **Use Privy or Dynamic**\
   Create or connect a wallet through your Privy or Dynamic app. Your project uses that provider to sign and send transfers.

3. **Use another local account**\
   Connect an EVM or Solana account you already manage locally. Point me to its existing setup so your project can use the same wallet and key storage.

4. **Create a bridge wallet that I own**\
   I'll create a new EVM or Solana wallet locally and store its key securely. You retain the keys and can send funds to its address to bridge them to Aleo.

**Choose the asset/network pairs**

For a transfer, choose the pair to use now. For your project, choose one or more pairs you'd like it to support.

- **SOURCE_NETWORK:** SOURCE_ASSET → DESTINATION_ASSET on Aleo

```

Fill pairs using [route selection](references/bridge-transfer.md#choose-the-route). Never leave placeholder text or example amounts in the rendered response. If no source wallet is known, omit its balance row and saved-wallet choice while retaining the other choices. Use the selected project's existing wallet when already specified.

This is a layout, not sample balance data. Omit zero-amount bullets. Summarize successful empty reads as “No nonzero private balances found in the checked assets” or “No nonzero public balances found in the checked assets,” as applicable. If private access is missing, locked, still syncing, or fails, state that reason in place of the private amounts. Public zeros do not establish that private balances are empty. Keep unavailable assets separate from verified holdings.

If a saved wallet's recipient differs from the selected Aleo account, say: “This wallet was previously set up to fund **SAVED_RECIPIENT**. Your selected receiving account is **SELECTED_RECIPIENT**.” Reading its balances does not change that recipient or reuse a pending transfer. Its saved status, such as “awaiting deposit,” is historical context, not evidence of current holdings. Keep technical state details out of the menu.

Add one scope line after the results: “These checks cover supported assets and network fees, not every asset in a wallet.” For EVM wallets, check Base, Ethereum mainnet, Arbitrum, and Arc even when the saved task used only one. On Arc, show USDC once as both bridge funds and gas. Read an already supplied source address alongside saved wallets, deduplicating repeated addresses, and label it **Your source wallet** if it is not a saved bridge wallet. Omit the previous-recipient line when none is known. An address supplied for inspection does not establish control of that wallet.

Repeat the asset-pair bullet for each supported choice, grouping pairs by source network when the list is long. For Base or Arbitrum USDC, add “via Arc” and explain once that both transfers have fees. Keep the separate recovery state internally. ETH on either L2 pays that network's transaction fees; do not list it as an asset that can be bridged through the USDC path.

Collect any missing wallet and pair choices at the end of this step, without a separate **Continue**, **Skip**, or “Check another wallet” prompt. If the person supplies another source address, read its relevant balances and keep the selected Aleo recipient unchanged. Do not repeat a choice the person has already made.

Every saved bridge wallet shown as a funding source needs a matching **Use the saved bridge wallet** choice before the new-address option. For several wallets, identify each choice by name or shortened address. Omit this choice when none is saved and renumber the menu. Missing gas does not remove the choice: add a short note such as “Needs ETH on Ethereum for network fees.” Selection proceeds to [reuse the saved wallet](references/local-wallets.md#reuse-a-saved-wallet); it does not create another address or submit a transfer. If access is known to be blocked, state what needs restoring. An unresolved transfer must be recovered before preparing another one.

When another usable wallet connection exists, add **Use CONNECTED_WALLET_NAME** before the new-address option, with its verified address and how approval happens. This can be a browser or hardware wallet through a supported integration, or an already configured local or hosted signer. Deduplicate it against saved-wallet choices and renumber the options. Never call an inspected public address a connected wallet. If someone asks to use a wallet without an available connection, explain the missing integration and offer sending from it to the deposit wallet or building that integration. Do not ask them to export its private key.

Read [local wallets and deposit addresses](references/local-wallets.md) when **Create a bridge wallet that I own** is selected. This asks the agent to create the wallet with the helper for the selected language after the network and asset are chosen: `local_wallet.py` for Python, `local-wallet.mjs` for JavaScript/TypeScript. The person supplies funds to the resulting address; do not ask them to create the wallet themselves. Switching to building follows [build bridging into the application](#build-bridging-into-the-application), preserving the account, source address, and any selected route. A Privy or Dynamic choice retains the chosen transfer-or-build outcome; configure the required provider connection in the selected project before a guided transfer. The bridge SDK connects signers; Privy and Dynamic provision their own wallets. Do not describe their server adapters as a consumer email-login flow.

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

Use [native Python funding](references/python-funding.md#quote-execute-and-recover) for Python, or [bridge transfer and recovery](references/bridge-transfer.md) for JavaScript/TypeScript. Present the source wallet, network, asset and amount, final Aleo address, route, expected confidential receipt, fees, and gas reserve. Explain any public arrival followed by automatic shielding, including its Aleo fee, as part of this transfer. For a route through Arc, include its intermediate wallet and both transfers. Resolve required Aleo fee funding before a source deposit.

Ask for approval of that concrete transfer unless it is already authorized with the same details and limits. Creating a wallet, reading balances, or selecting “bridge” does not authorize an unspecified amount. Keep an existing authorization instead of repeatedly asking for the same approval. Requote when the amount or fee limit changes materially; do not silently increase it.

Persist the transfer intent before submission and SDK checkpoints as they arrive. An unknown submission outcome requires inspecting the original transaction. Do not generate another wallet, quote a replacement transfer, or submit again to make a pending deposit appear faster. Keep each leg of a route through Arc separate and complete the first before funding the second.

## Finish a guided transfer at usable funds

Report source submission, bridge delivery, shielding when needed, and Aleo balance verification separately. After confirmed public delivery, perform the included shielding transaction automatically within the approved amount and fee limits. Do not stop to ask whether to shield. A completed private mint needs no further conversion. A completed bridge is not proof of spendable records, and a delayed scanner is not a reason for another deposit or shielding transaction.

Describe progress by where the funds are, using only verified results: received in the deposit wallet, transfer to Aleo submitted, or received on Aleo. If delivery is pending, say what is still waiting and whether the person needs to act. Do not read out internal state names or claim the funds are available for trading before checking that they are usable.

Use the receiving setup's existing signer and scanner to complete and verify confidential holdings. If funds have already arrived publicly but recipient access or fee funding is unavailable, report shielding as pending and restore the missing prerequisite. Do not label public arrival as complete, ask whether shielding is wanted, or repeat the bridge. Never request the recipient's private key in chat.

Keep the deposit wallet and checkpoints. Offer to return leftover assets to an address the person confirms, with the fee shown before sending; never infer a refund address from an exchange withdrawal sender. Do not sweep or delete a wallet automatically.

Return the Aleo address/network, funding method, source wallet and network, asset and observed amount, transaction identifiers, recovery location, delivery status, public/confidential balance status, and any outstanding fee or scanner requirement to the calling setup skill. Resume the trading task already chosen when funds are usable. Otherwise offer the main choices: trade, connect trading tools, build a strategy, or explore markets. A faucet request or bridge deposit by itself is not completion.
