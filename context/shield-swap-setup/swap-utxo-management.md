# Swap UTXO management

Private balances live in spendable records. Two records containing 1 token each are not automatically one input containing 2 tokens. A private swap spends one covering record whole and refunds change through the claim, and a pending swap ties up its input until that change becomes available.

Shield Swap SDK 0.14.0 (Veil), Python SDK 0.8.0, and CLI 0.14.0 add **record management**: inspect spendable records, plan joins and splits, execute that plan with shared reservations, and reconcile unfinished transactions after an interruption. The AgentKit MCP server exposes the same operations as tools. Reservations and recovery are **off by default** in both SDKs; enabling them is part of each recipe below.

## Shared behavior

- Inventory operates on the token's **underlying record program** (for example `usdcx_stablecoin.aleo`, or `credits.aleo` for ALEO), not the AMM wrapper used to route a swap. The SDK wrappers resolve it from token metadata.
- Inspecting or planning reads the scanner and reserves nothing. Reading reports **available** records, **reserved** records held by the shared journal, and the available balance. Amounts are integer base units.
- A plan targets a record count, minimum amount per record, and distribution (`preserve` keeps suitable records; `balanced` aims for equal amounts). It covers the entire available inventory of that asset. Review `steps` and the intrinsic credits `deduction` before executing. Network fees are additional.
- Executing a plan submits real join and split transactions one at a time, waiting for each confirmed output to appear in the scanner. An interruption keeps accepted steps on chain. Reconcile, read the inventory again, and plan again; never repeat an interrupted plan.
- A journal entry keeps its inputs reserved through `reserved`, `prepared`, and `submitted`; `confirmed` inputs stay excluded from stale scans; `rejected` releases execution inputs but keeps a charged private fee record; `cancelled` releases everything. A missing transaction or 404 does not release inputs.
- Coordination covers only clients that share the same store and chain identity. The CLI's SQLite journal, a Python store, an application's custom store, and the MCP's encrypted state are separate journals. Do not run uncoordinated writers against one account.

Use the [balance checks](bridge-funds.md) first to confirm the asset is private. Then use the interface the account already uses.

## AgentKit MCP — inspect, plan, rebalance

The standalone server enables record management on its session and keeps the journal inside its encrypted state directory, so swaps, claims, and maintenance from any MCP process on that directory see each other's reservations.

1. `get_record_inventory` with the selected `profileId` and `token` returns the resolved asset, `balance`, `availableCount`, `reservedCount`, and each record's `id` and base-unit `amount`. It reserves nothing.
2. `plan_record_inventory` saves a reviewable plan and returns `planId`, the resolved `asset`, `target`, `steps`, `stepCount`, and `deduction`. `minRecordAmount` is a human decimal amount in token units; omit it for a minimum of one base unit. The plan expires after ten minutes.

```json
{"name":"plan_record_inventory","arguments":{"profileId":"SELECTED_PROFILE","token":"TOKEN_ID","records":4,"minRecordAmount":"1.5","distribution":"balanced","toleranceBps":0,"maxTransactions":24}}
```

3. Execution needs `shield-swap-mcp configure --profile NAME --allow-inventory --inventory-fee-limit MICROCREDITS` from the trusted terminal. The fee limit caps the total network fee of one rebalance operation; absent or zero prevents execution. Then call `rebalance_record_inventory` with the `planId` and a stable `idempotencyKey`; it returns an operation ID. Poll `get_operation_status`.

A `complete` operation lists its `transactionIds` and `completedSteps`. A `failed` operation with `not_submitted` sent nothing. An `uncertain` operation stopped after submitting; reconcile it until every listed transaction is confirmed or rejected, then it reports `failed` with `nextAction: "plan_again"`. `resume_operation` never re-executes a plan. Permission changes are refused while an operation is queued or running.

`reconcile_record_inventory` returns the journal without saved transaction payloads and an `unresolvedCount`. With `rebroadcast: true`, it resends saved proved transactions unchanged; that requires the inventory permission and is a decision taken after inspecting the entries, not a routine poll.

The MCP runs one operation per wallet at a time. Prepare several records so successive single swaps each find a covering input; for simultaneous same-token swaps use the SDK path in [concurrent swaps](concurrent-swaps.md).

## CLI — inventory commands

CLI 0.14.0 adds `shield-swap inventory`, which uses the account saved by `setup` (or `ALEO_PRIVATE_KEY`) and needs no DEX authentication. Node.js 22.13 or newer is required for its built-in SQLite journal. `--asset` names the underlying record program; `--records` is the target count.

```sh
shield-swap inventory inspect --network testnet --asset credits.aleo --json
shield-swap inventory plan --network testnet --asset credits.aleo --records 4 --json
```

`plan` never signs. For a token, resolve its underlying program from token metadata (the Veil recipe below prints it) before passing it as `--asset`. Execute only when the user authorizes the maintenance transactions:

```sh
shield-swap inventory rebalance --network testnet --asset credits.aleo --records 4 --execute --json
shield-swap inventory status --network testnet --json
```

Without `--execute`, `rebalance` only prints the plan. The journal defaults to `.veil/inventory.sqlite` relative to the working directory; `--database` or `VEIL_INVENTORY_DB` selects another path. `status` lists journal entries without their saved transactions; unresolved entries keep their reservations and block further maintenance until the chain resolves them. Keep the journal across restarts and do not delete it to clear a pending spend.

Trading commands leave coordination off unless `VEIL_INVENTORY_DB` points at the same journal; set it for `swap` and `swap-concurrent` when maintenance runs for the same account so neither can reserve the other's inputs. `shield-swap inventory run --config inventory.json --execute` keeps policies continuously with cooldowns and daily fee budgets; it stays in the foreground for a service manager. Read the CLI package's `INVENTORY.md` for the policy schema before using it unattended.

## Veil — managed session and inventory methods

Install `@provablehq/shield-swap-cli` alongside the SDK packages for its SQLite store export, and use Node.js 22.13 or newer:

```sh
npm install @provablehq/shield-swap-cli
```

Save this as `managed-session.mts` beside the `session.mts` from [configure account](configure-account.md). It uses the same key and state directory conventions and enables record management on the client; the SQLite journal and the blinded-identity file are separate stores with separate responsibilities.

```ts
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadNetwork } from '@provablehq/veil-aleo-sdk'
import { shieldSwapActions } from '@provablehq/shield-swap-sdk'
import { swapFileStore } from '@provablehq/shield-swap-sdk/node'
import { sqliteRecordInventoryStore } from '@provablehq/shield-swap-cli/storage'

export const network = 'testnet'
const keyPath = process.env.SHIELD_SWAP_PRIVATE_KEY_FILE
const privateKey = (keyPath
  ? await readFile(keyPath, 'utf8')
  : process.env.SHIELD_SWAP_PRIVATE_KEY)?.trim()
if (!privateKey) throw new Error('Configure an existing key before loading the session')

const aleo = await loadNetwork(network)
const stateDir = join('.shield-swap', network, aleo.privateKeyToAccount(privateKey).address)
await mkdir(stateDir, { recursive: true, mode: 0o700 })
export const inventory = await sqliteRecordInventoryStore(join(stateDir, 'inventory.sqlite'))
export const { walletClient, account } = aleo.createAleoClient({
  privateKey,
  records: aleo.createRemoteScanner({ waitForSync: true }),
  confirmationTimeout: 600_000,
  recordManagement: { enabled: true, store: inventory, chainId: `aleo:${network}` },
})
export const client = walletClient.extend(shieldSwapActions({
  api: {},
  blindedIdentities: swapFileStore(join(stateDir, 'blinded.json')),
}))
await client.authenticateShieldSwap()
```

Every script that trades or maintains this account must import this module so its writes reserve inputs in the same journal. Call `inventory.close()` only after all calls have settled. Use `aleo:testnet` or `aleo:mainnet` as the chain identity for every participant; different identities create separate reservation groups.

To inspect inventory, save as `inventory.mts` and run `npx tsx inventory.mts`:

```ts
import { client, inventory } from './managed-session.mts'

const token = await client.tokenData('USDCx')
if (!token.underlyingProgram) throw new Error('Token has no private record program')
const records = await client.getRecordInventory({ asset: { program: token.underlyingProgram } })
const largest = records.available.reduce((max, record) => record.amount > max ? record.amount : max, 0n)
console.log({
  asset: token.underlyingProgram,
  available: records.available.length,
  reserved: records.reserved.length,
  balance: records.balance.toString(),
  largest: largest.toString(),
})
inventory.close()
```

Amounts are base units. Reserved records are held by this journal's entries, including inputs of confirmed transactions that a stale scanner still reports. Never log record plaintext.

To plan, save as `plan-inventory.mts` and run `npx tsx plan-inventory.mts`:

```ts
import { parseUnits } from '@provablehq/shield-swap-sdk'
import { client, inventory } from './managed-session.mts'

const token = await client.tokenData('USDCx')
const plan = await client.planInventory({
  token: token.id,
  target: { records: 4, minRecordAmount: parseUnits('1.5', token.decimals), distribution: 'balanced', toleranceBps: 0 },
  maxTransactions: 24,
})
console.table(plan.steps.map(step => ({
  operation: step.kind, inputs: step.inputs.length, outputs: step.outputs.length,
  helper: step.joinProgram?.program ?? 'native',
})))
console.log({ asset: plan.asset.program, deduction: plan.deduction.toString() })
inventory.close()
```

Planning reserves nothing. The example target (four records of at least 1.5 USDCx, balanced) is illustrative; use the user's trade size and concurrency. For an authorized rebalance, continue in the **same script/process**, retaining `plan`, before closing the store:

```ts
const result = await client.rebalanceRecordInventory({ plan, timeoutMs: 600_000, pollIntervalMs: 3_000, maxFeeMicrocredits: 5_000_000n })
console.log({ status: result.status, transactions: result.transactionIds, completedSteps: result.completedSteps })
if (result.status === 'interrupted') {
  await client.reconcileRecordInventory()
  throw new Error(`Inventory maintenance interrupted: ${result.reason}`)
}
```

`maxFeeMicrocredits` caps the run's total network fees; `plan.deduction` is charged separately on native credits splits. Execution rechecks every input and stops if another operation consumed or reserved one. `client.rebalanceInventory({ token, target })` plans and executes in one call; use it only when a separate review of the plan is not required.

After an interruption or restart, save as `reconcile-inventory.mts` and run `npx tsx reconcile-inventory.mts`:

```ts
import { client, inventory } from './managed-session.mts'

const journal = await client.reconcileRecordInventory()
const unresolved = journal.filter(entry => !['confirmed', 'rejected', 'cancelled'].includes(entry.status))
console.table(unresolved.map(entry => ({
  operation: entry.id, transactionId: entry.transactionId, status: entry.status,
  attempts: entry.rebroadcastAttempts ?? 0, error: entry.lastRebroadcastError,
})))
inventory.close()
```

Reconciliation reads the chain and updates the journal; it submits nothing. When inspection shows a saved transaction never reached the network, `client.reconcileRecordInventory({ rebroadcast: true })` resends that exact proved transaction with its original id. Broadcast acceptance is not confirmation; check again later. Unresolved entries must be resolved before planning again.

## Python — managed facade and inventory methods

Python SDK 0.8.0 adds record inventory to the `aleo` facade (`aleo.inventory`) and the wrappers `dex.plan_inventory(...)` and `dex.rebalance_inventory(...)` to the DEX client. `ShieldSwap.from_profile()` still builds an **unmanaged** facade: reservations and recovery require constructing `Aleo(provider, record_management=...)` yourself. The bundled stores are `MemoryRecordInventoryStore` (one process, lost on exit), `JsonFileRecordInventoryStore(path)` (one JSON file under a file lock), and `SqliteRecordInventoryStore(path)` (Python's bundled `sqlite3`, same table layout as Veil's store, so one journal can be shared with a Veil client). Import them from `aleo.inventory`; the Shield Swap package does not re-export them.

Save this as `managed_session.py` beside the `session.py` from [configure account](configure-account.md). It reuses the existing profile's key, network, endpoint, credentials, and swap journal, and adds a SQLite record journal inside the profile directory:

```python
import aleo
from aleo import Aleo, HTTPProvider
from aleo.inventory import RecordManagementConfig, SqliteRecordInventoryStore
from aleo_shield_swap import Journal, Profile, ShieldSwap

home = Profile.default_home()
if not (home / "profile.json").is_file():
    raise RuntimeError("Select an existing profile before enabling record management")
profile = Profile.load_or_create(home)
credentials = profile.credentials
store = SqliteRecordInventoryStore(home / "inventory.sqlite")
client = Aleo(
    HTTPProvider(profile.endpoint, network=profile.network,
                 api_key=credentials.get("dps_api_key"),
                 consumer_id=credentials.get("dps_consumer_id")),
    record_management=RecordManagementConfig(
        enabled=True, store=store, chain_id=f"aleo:{profile.network}"),
)
client.default_account = client.account.from_private_key(profile.private_key)
registration = client.records.register(client.default_account)
if not registration.get("ok"):
    raise RuntimeError(f"Record scanner registration failed: {registration.get('error')}")
dex = ShieldSwap(client)
dex.profile = profile
dex.journal = Journal(profile.journal_path)
key = getattr(aleo, profile.network).PrivateKey.from_string(profile.private_key)
dex.api.authenticate(profile.address, lambda message: str(key.sign(message.encode())))
```

Every script that trades or maintains this account must import `dex` and `client` from this module so its writes reserve inputs in the same journal. `inventory.sqlite` holds record nonces and pending proved transactions, never keys or plaintext; keep it with the profile and never delete it to clear a pending spend. Leave `max_fee_microcredits` unset while the delegated prover's fee master pays fees.

To inspect inventory, save as `inventory.py` and run `python inventory.py`:

```python
from aleo.inventory import RecordAsset
from aleo_shield_swap import ShieldSwapError
from managed_session import client, dex

token = dex.api.get_token("USDCx")
if not token.underlying_program:
    raise ShieldSwapError("Token metadata names no private record program")
snapshot = client.inventory.get_record_inventory(RecordAsset(program=token.underlying_program))
print({"asset": token.underlying_program,
       "available": len(snapshot.available),
       "reserved": len(snapshot.reserved),
       "balance": snapshot.balance,
       "largest": max((record.amount for record in snapshot.available), default=0)})
```

Amounts are integer base units. Reserved records are held by this journal's entries. `dex.plan_inventory` resolves the underlying program from the symbol itself, so the plan recipe below does not pass it.

To plan, save as `plan_inventory.py` and run `python plan_inventory.py`:

```python
from decimal import Decimal
from aleo.inventory import InventoryTarget
from managed_session import dex

token = dex.api.get_token("USDCx")
minimum = int(Decimal("1.5").scaleb(token.decimals))
plan = dex.plan_inventory("USDCx", InventoryTarget(records=4, min_record_amount=minimum,
                                                   distribution="balanced", tolerance_bps=0),
                          max_transactions=24)
for step in plan.steps:
    helper = step.join_program.program if step.join_program else "native"
    print(f"{step.kind:5} inputs={len(step.inputs):2} outputs={len(step.outputs)} via {helper}")
print({"asset": plan.asset.program, "deduction": plan.deduction})
```

Planning signs and reserves nothing; `InventoryPlanError` means the target cannot be reached from the available records. For an authorized rebalance, continue in the **same script/process**, retaining `plan`:

```python
result = client.inventory.rebalance_record_inventory(plan, timeout=600.0, poll_interval=3.0)
print({"status": result.status, "transactions": list(result.transaction_ids),
       "completed_steps": result.completed_steps})
if result.status != "complete":
    client.inventory.reconcile_record_inventory()
    raise RuntimeError(f"Inventory maintenance interrupted: {result.reason}")
```

`dex.rebalance_inventory("USDCx", target, ...)` plans and executes in one call; use it only when a separate review is not required. Execution rechecks each input and stops before proving if another operation consumed or reserved one.

After an interruption or restart, save as `reconcile_inventory.py` and run `python reconcile_inventory.py`:

```python
from managed_session import client

journal = client.inventory.reconcile_record_inventory()
for entry in journal:
    if entry.status not in ("confirmed", "rejected", "cancelled"):
        print({"operation": entry.id, "transaction_id": entry.transaction_id,
               "status": entry.status, "saved_transaction": entry.transaction is not None})
```

Reconciliation reads the chain and submits nothing. After inspection, `client.inventory.reconcile_record_inventory(rebroadcast=True)` resends a saved proved transaction with its original id. Entries still `reserved`, `prepared`, or `submitted` keep their inputs; resolve them before planning again. Unlike Veil, the inspected Python journal entry does not record rebroadcast attempts or the last broadcast error.

The single-trade readiness check is unchanged, and since 0.8.0 it also excludes records reserved in the journal when the client is managed. Save as `check_inventory.py` and run `python check_inventory.py`:

```python
from authenticate import dex

token = dex.api.get_token("USDCx")
print({"token_id": token.address,
       "covers_one_swap": dex.has_swap_balance(token.address, "1.5")})
```

The decimal string is in token units; an integer input would be base units. Replace the token and amount with the intended trade. This checks availability, not reservation.

## Coordinate before adding concurrency

Enabled record management reserves input records atomically in the shared store before proving and keeps reservations through unknown outcomes. It does not partition blinded identities: Veil's bundled identity stores coordinate counters within one process, so run one trader process per account with those stores, or supply distinct explicit identities per process. Python journals counters under its profile lock.

Record management also does not join insufficient records during a swap, split balances automatically, or run maintenance in the background. Prepare the inventory before the strategy runs rather than putting reshaping on every trade's critical path, and recheck availability immediately before spending; inventory measurements are snapshots.

For simultaneous same-token swaps, follow [concurrent swaps](concurrent-swaps.md). If holdings exist but a trade cannot select a record, follow [record contention](../troubleshooting/record-contention.md) and [scanner lag](../troubleshooting/scanner-lag.md).
