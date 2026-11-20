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

When account setup calls this skill, retain the verified Aleo address, account name, network, chosen funding option, project, signer, scanner status, and intended trading task. Also retain whether the person wants a guided transfer or funding scripts. Show the destination address and allow a correction without making someone type it again. Preserve an existing wallet connection and authorization.

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

Option 4 selects the scripts path directly. Keep the selected Aleo account and project, then show [the funding-script wallet choices](#set-up-funding-scripts) as Step 3. Skip the guided-transfer-or-scripts question and the guided deposit instructions. Do not require a funded source wallet or a live transfer to complete script setup.

Populate the account list from the discovered accounts; the two rows above are examples, not a limit. Use consecutive letters and keep **Another Aleo address** last. Show full verified addresses, never invented alternatives or only a sentence saying other accounts exist. If several names share an address, show their names together without duplicating the destination. An account supplied by a connected wallet or the environment can be listed with that source as its label when it has no saved name. “Selected by default” marks the active choice; it does not mean the account must be named `default`.

If no account can be resolved, show Step 1 and ask, “Which Aleo address would you like to fund?” Retain any funding choice already given. If alternatives exist but the SDK-selected account is unavailable, list them without silently promoting the first one. With a selected funding method, show the account list without requiring another confirmation of an account already explicitly chosen, then continue that method. Account files are network-neutral; bridging targets mainnet, the faucet targets testnet, and a direct receipt keeps the requested network or asks which network to use.

## Choose a guided transfer or funding scripts

After mainnet bridging is selected, offer this choice before wallet setup if the intent is still unclear. Choosing **Build programmatic funding** in the opening menu goes directly to the scripts path without this question. A request to write scripts or build a funding integration also selects the scripts path; an explicit request to carry out a transfer now selects the guided path. A general choice of “bridge” does not settle this question.

```markdown
**Step 3: Choose how you'd like to bridge**

1. **Fund my account now**\
   Get help choosing a wallet, reviewing fees, and completing a bridge transfer.

2. **Set up my own funding scripts**\
   Create scripts to fund your Aleo account from Privy or Dynamic, a local account, or a new wallet you send funds to.

---

Which option would you like to use?
```

For scripts, continue to [set up funding scripts](#set-up-funding-scripts). For a guided transfer, continue to the optional balance check below. Keep these as separate paths; script setup does not require a deposit or live transfer. Number subsequent steps for the path actually shown, omitting questions already answered.

## Set up funding scripts

Offer these choices only on the scripts path, retaining a provider or custody choice already supplied:

```markdown
**Step 3: Choose a wallet for your scripts**

1. **Use Privy or Dynamic**\
   Connect a wallet managed through your Privy or Dynamic app.

2. **Use a local account**\
   Use an account you manage, or create one on this computer with its private key stored securely.

3. **Create a wallet I can send funds to**\
   Create an EVM or Solana wallet, send assets to it from your wallet or exchange, then run your scripts to bridge them to Aleo.

---

Which option would you like to use?
```

Follow [build the funding scripts](references/funding-scripts.md). Use the existing project and language; ask where to put the scripts only if that is unknown. Ask Privy or Dynamic only after that choice is selected. A local account can already hold funds; the deposit-wallet path creates a dedicated receiving wallet and includes commands to check arrivals before bridging. Both retain credentials and recovery state across runs.

Offer the public source balance check when an address is available, without making an existing funded wallet a requirement for writing scripts. Do not ask for a deposit as part of script setup. Finish with the created files, exact run commands, checks performed, and any remaining provider or credential setup. Return `funding scripts prepared` and the actual funding status to the calling skill; do not proceed through the guided transfer steps unless the person also asks to fund now.

## Check an existing source wallet

Offer this optional step on the guided bridge path:

```markdown
**Step 4: Check an existing wallet · Optional**

Share an Ethereum-style address to see its balances on **Base, Ethereum mainnet, Arbitrum, and Arc**. This only reads public balances; it doesn't connect your wallet or move funds.

Send an address, or reply **Skip**.
```

An EVM address must not fill the Aleo recipient field. Ask only for missing information; a supplied source address counts as choosing the public balance check.

Run the [source balance check](references/balances.md) when an EVM address is supplied. Show all four networks, native gas, and the supported assets found, including zeros. Mark failed reads **Unavailable**. Explain the scope in one line: this checks assets supported by the bridge, not every asset in the wallet. Arc's USDC pays for both the transfer and gas; show it once.

Show what a positive balance can fund, using the sending asset/network and the asset received on Aleo. For Base or Arbitrum USDC, explain that the funds pass through Arc before reaching Aleo as USDCx and that both transfers have fees. Keep the separate recovery state internally. Explain ETH on either L2 as money for that network's transaction fees; it cannot be sent to Aleo through this USDC path. An address supplied for inspection does not establish control of that wallet.

If the check was skipped, continue to the wallet choice. Do not turn an optional address into a setup requirement.

## Choose how to supply the funds

For a guided transfer, reuse a configured signer when one has already been selected. Otherwise offer the following deposit-wallet path alongside any verified connections:

```markdown
**Step 5: Choose a funding wallet**

1. **Create a bridge address for me**\
   A local EVM or Solana wallet that you own is created and stored locally and used to bridge funds to Aleo. I will use the funds you send to this wallet to bridge funds to Shield Swap.

2. **Set up my own funding scripts**\
   Set up funding from Privy or Dynamic, a local account, or a new deposit wallet.

---

Which option would you like to use?
```

When a usable wallet connection exists, add **Use CONNECTED_WALLET_NAME** before the deposit option, with its verified address and how approval happens. This can be a browser or hardware wallet through a supported integration, or an already configured local or hosted signer. Renumber the options. Never show “Keep your connected wallet” based only on a public address or a wallet mentioned in conversation. If someone asks to use a wallet without an available connection, explain the missing integration and offer sending from it to the deposit wallet or building that integration. Do not ask them to export its private key.

Read [local wallets and deposit addresses](references/local-wallets.md) for a deposit wallet. Selecting this option asks the agent to create the wallet with the bundled helper after the network and asset are chosen. The person supplies funds to the resulting address; do not ask them to create the wallet themselves. The scripts choice switches to [set up funding scripts](#set-up-funding-scripts), preserving the account, source address, and any selected route. New provider integration belongs on that path. The bridge SDK connects signers; Privy and Dynamic provision their own wallets. Do not describe their server adapters as a consumer email-login flow.

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

Use [bridge transfer and recovery](references/bridge-transfer.md). Present the source wallet, network, asset and amount, final Aleo address, route, estimated receipt, fees, gas reserve, and whether delivery is public or confidential. For a route through Arc, include its intermediate wallet and both transfers. Explain any required Aleo fee funding before a source deposit.

Ask for approval of that concrete transfer unless it is already authorized with the same details and limits. Creating a wallet, reading balances, or selecting “bridge” does not authorize an unspecified amount. Keep an existing authorization instead of repeatedly asking for the same approval. Requote when the amount or fee limit changes materially; do not silently increase it.

Persist the transfer intent before submission and SDK checkpoints as they arrive. An unknown submission outcome requires inspecting the original transaction. Do not generate another wallet, quote a replacement transfer, or submit again to make a pending deposit appear faster. Keep each leg of a route through Arc separate and complete the first before funding the second.

## Finish a guided transfer at usable funds

Report source submission, bridge delivery, and Aleo balance verification separately. Hyperlane delivery and public USDCx mints can leave public balances. A confidential balance may require a separate authorized conversion with Aleo fees. A completed bridge is not proof of spendable records, and a delayed scanner is not a reason for another deposit.

Describe progress by where the funds are, using only verified results: received in the deposit wallet, transfer to Aleo submitted, or received on Aleo. If delivery is pending, say what is still waiting and whether the person needs to act. Do not read out internal state names or claim the funds are available for trading before checking that they are usable.

For a destination owned by the current setup, use its existing signer and scanner to verify the received asset. For an address someone supplied without wallet access, report confirmed public delivery or the provider's tracking result and the verification still needed. Do not request the recipient's private key to complete that check.

Keep the deposit wallet and checkpoints. Offer to return leftover assets to an address the person confirms, with the fee shown before sending; never infer a refund address from an exchange withdrawal sender. Do not sweep or delete a wallet automatically.

Return the Aleo address/network, funding method, source wallet and network, asset and observed amount, transaction identifiers, recovery location, delivery status, public/confidential balance status, and any outstanding fee or scanner requirement to the calling setup skill. Resume the trading task already chosen when funds are usable. Otherwise offer the main choices: trade, connect trading tools, build a strategy, or explore markets. A faucet request or bridge deposit by itself is not completion.
