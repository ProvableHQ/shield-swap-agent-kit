# Fund with Python

Keep the selected Python project, interpreter, Aleo account, and source wallet. Use the latest `aleo-bridge-sdk` from PyPI through [the Python installation instructions](dependencies.md#python). Import it as `aleo_bridge`. No Node process or JavaScript project is needed.

Use the same guided menus and funding choices as the main skill. The recipes below are implementation instructions, not additional onboarding questions.

## Use the installed Python SDK

Check the installed package with `importlib.metadata.version("aleo-bridge-sdk")` and inspect the methods used below. Verify the selected route in `DEFAULT_REGISTRY.routes(environment="mainnet", source_chain=SOURCE_CHAIN)`. Keep active routes and resolve assets through the same registry. Base/Arbitrum USDC requires both the CCTP route to Arc and the xReserve route from Arc to Aleo.

Use the installed SDK's normal quote, execute, and recovery flow. Do not make `Bridge.pause_status` or another optional inspection method a setup requirement. Newer SDK versions perform their pause checks inside the bridge lifecycle. Let the SDK enforce its checks and handle the errors it actually returns; do not add a capability-gap menu, switch to JavaScript, or build from source because the separate inspection method is absent. Explain an actual unavailable route, rejected quote, or failed operation in terms of the transfer and the next useful action.

## Create or reuse the source wallet

An existing EVM or Solana wallet keeps its identity when used from Python. Load its credential from the existing secret source; do not recreate it because a previous helper used JavaScript. The bundled helpers use the same public manifest fields and key encodings, but credential-store access must be verified on the current OS. If an existing credential cannot be opened, preserve its files and resolve access before creating anything else.

For a new local wallet, copy [local_wallet.py](../scripts/local_wallet.py) into the Python project. It generates EVM keys with `eth-account` and Solana keys with `solders`, storing secrets through `keyring` in macOS Keychain, Windows Credential Manager, or Linux Secret Service. It selects the OS backend explicitly and stops when that store is unavailable. It writes only public metadata and a credential reference to disk.

Create a private parent directory, then choose a new `WALLET_DIRECTORY` beneath it. Replace `SOURCE_CHAIN` and `SOURCE_ASSET` with the selected registry keys, and `ALEO_ADDRESS` with the existing recipient. The chain choices are `ethereum`, `base`, `arbitrum`, `arc`, and `solana`.

```sh
python local_wallet.py create --state-dir WALLET_DIRECTORY --chain SOURCE_CHAIN --asset SOURCE_ASSET --recipient ALEO_ADDRESS --purpose deposit
python local_wallet.py check --state-dir WALLET_DIRECTORY
```

Use `--purpose reusable` for a reusable local source account. The second command reopens the credential in another process and verifies its address without submitting anything. Creation refuses to replace an existing directory. If creation was interrupted, use `python local_wallet.py recover --state-dir WALLET_DIRECTORY`; this restores public metadata from the saved credential and never generates another key.

Before displaying deposit instructions, have the person save the key in their password manager by running this in their own terminal:

```sh
python local_wallet.py backup --state-dir WALLET_DIRECTORY
```

Never run `backup` through an agent tool or capture its output. Confirm that they saved it without asking for the secret. Keep the wallet for recovery, refunds, and remaining funds. Processes allowed to read its key can spend from it; the OS store does not enforce bridge-only spending.

## Connect the source and existing Aleo client

Use the existing `Aleo` client from account setup for private delivery or automatic shielding. Verify its network and address before signing. An unsigned `Aleo(HTTPProvider(endpoint, network="mainnet"))` can read public destination state, but cannot perform the required shielding. Do not call `Bridge.from_profile()` or `Profile.load_or_create()` to obtain a new destination account.

Save this function in the project's funding module. `aleo` is that existing client; the remaining arguments select the saved source wallet, its RPC, and the persistent journal. Create the journal's private parent with mode `0700` first. Calling the function opens the source credential and creates journal storage; it does not sign or send a transaction.

```python
from aleo_bridge import Bridge, FileCheckpointStore
from local_wallet import load_local_client

def open_bridge(aleo, source_chain, rpc_url, wallet_directory, journal_directory):
    if aleo.network_name != "mainnet":
        raise ValueError("Funding requires the selected mainnet Aleo client")
    source = load_local_client(wallet_directory, source_chain, rpc_url)
    store = FileCheckpointStore(journal_directory)
    connections = {"solana": source} if source_chain == "solana" else {"evm": {source_chain: source}}
    return Bridge(aleo, checkpoints=store, **connections), source, store
```

An existing managed secret can instead supply `Ethereum(rpc_url, private_key=secret)` or `Solana(rpc_url, private_key=secret)`. Load the secret inside the process and compare the resulting `.address` with the intended wallet. Never pass it as a command argument or print the connection object. For a route through Arc, configure both EVM connections, verifying control of the intermediate wallet.

## Read balances

Construct unsigned `Ethereum(rpc_url)` connections for Base, Ethereum, Arbitrum, and Arc, and pass them as the `evm` mapping to `Bridge`. An unsigned `Solana(rpc_url)` supplies the `solana` connection when that network is selected. Public balance reads do not need a new Aleo account or source key.

For each EVM network, check `connection.w3.eth.chain_id` against Ethereum `1`, Base `8453`, Arbitrum `42161`, or Arc `5042` before trusting balances. Resolve assets with `bridge.registry.assets(chain=chain, environment="mainnet")`. Call `bridge.evm(chain).balance(asset, address=source_address)` for each registered asset and `bridge.from_atomic(raw, asset)` for display. Include native ETH for fees on Ethereum, Base, and Arbitrum. Arc's registered USDC contract balance includes the funds used for gas; show it once and do not add the native 18-decimal view to it.

For Solana, use `bridge.sol.balance(asset, address=source_address)` for the selected registry mint and SOL for fees. Keep exact integer base units and the registry decimals. Preserve successful reads when another fails; report failed reads as unavailable, not zero. Do not print raw exceptions or credential-bearing RPC URLs.

## Connect Privy or Dynamic

Reuse the selected provider app and wallet. Installing the bridge SDK includes its Python provider dependencies; Dynamic requires Python 3.11 or newer. Load credentials from the project's existing secret source. Provisioning is a separate explicit setup operation, never an import or quote side effect.

For Privy, this function connects a configured EVM wallet. The environment variables identify the existing app, wallet, public address, and optional owner authorization key. `resolve()` verifies the wallet identity without signing:

```python
import os
from privy import PrivyClient
from aleo_bridge import Ethereum
from aleo_bridge.privy import PrivyEvmSigner

def privy_source(rpc_url):
    provider = PrivyClient(app_id=os.environ["PRIVY_APP_ID"], app_secret=os.environ["PRIVY_APP_SECRET"])
    owner_key = os.environ.get("PRIVY_AUTHORIZATION_PRIVATE_KEY")
    signer = PrivyEvmSigner(
        provider, wallet_id=os.environ["PRIVY_EVM_WALLET_ID"], address=os.environ["PRIVY_EVM_ADDRESS"],
        authorization_private_keys=[owner_key] if owner_key else None,
    )
    signer.resolve()
    return Ethereum(rpc_url, signer=signer)
```

For a new Privy wallet, use the installed Python provider's wallet creation API with the chosen owner, policy, and chain type. Persist its returned wallet ID and address once; look up the original wallet after an uncertain creation response. Do not translate JavaScript calls mechanically or export a provider wallet's key to make an example work.

For Dynamic, this function connects the configured EVM wallet. Use the saved password for provider-backed shares or pass caller-managed `key_shares` from the existing secret store. Keep the complete creation/backup metadata outside version control.

```python
import os
from dynamic_wallet_sdk import DynamicEvmWalletClient
from aleo_bridge import Ethereum
from aleo_bridge.dynamic import DynamicEvmSigner

def dynamic_source(rpc_url):
    provider = DynamicEvmWalletClient(os.environ["DYNAMIC_ENVIRONMENT_ID"])
    signer = DynamicEvmSigner(
        provider, address=os.environ["DYNAMIC_EVM_ADDRESS"],
        api_token=os.environ["DYNAMIC_API_TOKEN"], password=os.environ["DYNAMIC_WALLET_PASSWORD"],
        wallet_id=os.environ.get("DYNAMIC_EVM_WALLET_ID") or None,
    )
    signer.resolve()
    return Ethereum(rpc_url, signer=signer), signer
```

Call `signer.close()` when finished with the Dynamic session. `resolve()` checks provider access and identity; it does not prove shares can be decrypted or that a spending policy permits the transfer. Verify backup recovery through the installed provider's `recover_key_shares` interface before accepting deposits. If a new wallet is needed, authenticate the Python client, call its `create_wallet_account` with the selected threshold and backup password, and preserve the returned wallet metadata and backup before showing an address. These provider methods are asynchronous; inspect their installed signatures and await them rather than copying the JavaScript provisioning calls.

For Solana, use `PrivySolanaSigner` with `Solana(rpc_url, signer=signer)`, or `DynamicSolanaSigner` with `DynamicSvmWalletClient`. Use the corresponding Solana wallet ID/address, preserve case, and verify the original wallet. Confirm provider support on every chosen chain, including Arc for a two-transfer path.

## Quote, execute, and recover

Use `bridge.quote(source_chain=..., source_asset=..., destination_chain="aleo", destination_asset=..., amount=..., sender=..., recipient=..., mint_mode=...)`. `amount` is a human decimal string. Keep `quote.plan` unchanged and display `quote.amount_out` and `quote.fees`. A fee with `amount=None` is unpriced, not free. Use the installed SDK's lifecycle checks without requiring a separate `pause_status` call. If the SDK refuses an operation because it is paused or cannot verify availability, resolve that actual result before proceeding; do not bypass the check or repeat a submitted transfer.

For xReserve, `mint_mode="public"` creates a public balance, `"record"` requests relayer delivery of a private record, and `"private"` conceals the Aleo recipient in the source deposit and requires a later recipient claim. Select the actual supported mode and explain the public fields. Public arrivals are shielded automatically as part of this funding operation; do not offer a public-only finish or a separate shielding decision. For `"private"`, generate and securely persist a nonzero Aleo scalar before quoting, then pass the same `secret_nonce` to quote, execute, and complete. The checkpoint does not back up that nonce. Before the bridge starts, verify asset privacy support, recipient signer access, and fees for the required mint or shielding step. Include those fees in the approved transfer limits.

Before the first write, reserve one persistent operation directory under a private parent and save the intended source, recipient, asset, amount, and an unresolved-submission marker. Use exclusive creation and an operation lock so two processes cannot submit the same transfer. An existing directory means inspect the original operation, not choose a new directory automatically. Keep the marker through a crash or exception, even when the SDK has not yet produced a checkpoint.

| Operation | Python API and behavior |
| --- | --- |
| Submit once | After the concrete transfer is authorized, call `bridge.execute(quote.plan, on_checkpoint=...)`. Attach `FileCheckpointStore` before calling it and persist the callback's checkpoint ID with the operation. |
| Monitor | `bridge.wait(progress, timeout_seconds=...)` reads progress. Keep waits bounded and retain `PollingTimeoutError.progress` when supplied. |
| Reload | `store.load_checkpoints()` returns valid checkpoints and errors; report unreadable state. Load the saved operation's checkpoint with `store.load(checkpoint_id)` and call `bridge.recover(checkpoint)`. |
| Continue source work | Only for a known, reconciled operation whose fresh progress says `next == "resume"`, use `bridge.resume(progress, on_checkpoint=...)` within its existing authorization. |
| Complete delivery | For fresh `next == "complete"`, use `bridge.complete(progress, on_checkpoint=..., secret_nonce=...)` with the original recipient and nonce when applicable. Retain its transaction ID and checkpoint. |

Recovery does not authorize another submission. A missing checkpoint, missing source hash after a write, or unknown submission result requires reconciliation with wallet and chain evidence before any further write. An approval checkpoint alone does not prove a later deposit was never sent. Do not clear the marker, create another operation, or call `execute` again to recover an interrupted transfer. Inspect an uncertain destination submission before repeating a claim.

For Base or Arbitrum USDC, configure both source and Arc clients. Quote CCTP to the controlled Arc address with `bridge_protocol="cctp"` and the installed `CctpOptions`, then complete that leg before quoting Arc to Aleo. Keep separate operation directories, reserve Arc USDC for fees, and use the actual delivered balance for the second amount. Follow only these inbound legs; a round-trip example also withdraws the funds again.

Verify delivery to the selected Aleo account. For public arrivals, automatically use `bridge.shield(asset, amount=...).delegate()` with the same existing Aleo client, covering only the received amount and retaining any required fee reserve. The method constructs an `AleoCall`; `.delegate()` submits it. This transaction is included in the bridge authorization, so do not ask for separate permission to shield.

Persist a shielding stage under the original operation's lock before submission, including the asset, recipient, amount, approved fees, and unresolved-submission marker. Retain the receipt's `transaction_id` and confirmation state. `FileCheckpointStore` tracks the bridge lifecycle, not this separate `AleoCall`. After an uncertain response or restart, inspect the original shielding submission before any further write. A confirmed shield awaiting scanner indexing must not be submitted again. Record or private USDCx delivery needs no additional shielding. Verify usable records through the existing scanner before marking the funding operation complete.

Build setup ends with Python code in the chosen form and a calling example, app integration instructions, or run commands as appropriate. Perform syntax/import checks and offline failure tests before handing it over. Distinguish those checks from provider access, actual OS credential storage, and funded transfers; do not make a live transfer just to validate setup.
