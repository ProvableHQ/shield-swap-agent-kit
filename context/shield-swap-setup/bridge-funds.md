# Fund the account

Check existing private holdings before requesting or transferring funds. Authentication does not fund an account, and a bridge receipt does not prove that the destination scanner can see spendable records.

Choose the funding source: a testnet faucet, assets already on Aleo, or a supported cross-chain bridge. This page does not select a trade or authorize one. SDK examples use the authenticated client from [configure Shield Swap](configure-shield-swap.md).

## AgentKit MCP — use existing funds or bridge

Continue with the profile selected during [account setup](configure-account.md). This funding step also belongs to **Connect trading tools**: bind the terminal, bot, or app to this same funded account.

1. Call `setup` with `profileId` and `checkBalances: true`, or read `get_balances` directly. If the intended asset and amount are known, supply `setup.funding` with its discovered `tokenId` and integer base-unit `amount`. Public-only holdings are not sufficient for a private swap. A scanner failure is unknown funding, not zero funds.
2. If existing usable funds cover the task, skip the transfer. Otherwise choose receipt on Aleo or a supported bridge. Use `list_bridge_routes` to check the actual source/destination assets and availability before suggesting a source chain. The current MCP exposes Aleo, Ethereum and Solana; it does not expose Base, Arbitrum or Arc selectors.
3. Reuse the source wallet, or configure it through the [trusted terminal](../../mcp/README.md#configure-local-bridge-wallets). Users can retain local keys outside the conversation or use an [existing Privy/Dynamic hosted wallet](../../mcp/README.md#configure-hosted-bridge-wallets). These adapters do not offer consumer email login or create hosted accounts; Aleo signing remains local.
4. Call `quote_bridge` for the selected route, amount, and destination profile. Inspect minimums, fees, output and mint mode. Resolve source gas funding and any missing execution permission before signing. Enable only the intended route's base-unit cap through terminal configuration; a setup request alone does not authorize moving funds.
5. For the authorized transfer, call `execute_bridge` once with the saved quote ID and a stable idempotency key. Retain the operation ID. Poll `bridge_status`; after a timeout or restart, use `recover_bridge_transactions` and the original operation. Call `resume_operation` only for a required safe next step. Do not create a new deposit to recover an uncertain one.
6. Verify the bridge destination and then read the intended Aleo account's private holdings. A public mint may need a supported public-to-private conversion; the MCP has no general conversion tool, so report that gap and use a verified same-account SDK path when available. Scanner lag is a pending funding check, not a reason to bridge again.

A bridge status requiring external destination verification is incomplete until that verification is supplied. In particular, the current SDK cannot verify some outbound Ethereum releases: follow the operation's guidance instead of repeating the transfer. The [MCP validation notes](../../mcp/README.md) distinguish live-verified routes from adapters that have only local test coverage.

After funding, continue the selected journey: trade, verify the connected trading tool, or prepare the strategy. Keep fee and covering-record checks separate from aggregate holdings.

## CLI — check first, then fund if needed

```sh
shield-swap balances --network testnet --all --json
```

Check `address`, `network`, and each token's `private`, `public`, and `decimals`. Amounts are base-unit strings. A positive `total` does not guarantee private spending capacity, and a sum of small private records may not cover a swap that requires one larger record.

If testnet funding is requested and no job is already running:

```sh
shield-swap setup --network testnet
```

Setup stores the faucet job id and resumes polling on subsequent runs. Exit code `3` with `AIRDROP_PENDING` means funding or scanner indexing is still pending; do not create a new account. Re-run the balance read to check progress.

The current setup skips its faucet when it finds *any* holdings, not necessarily the asset or private record the requested task needs. For missing assets, use the SDK faucet below or the selected funding route. If setup hits the obsolete invite gate, use the [CLI session fallback](../toolchains/cli.md#reuse-a-cli-account-from-a-script).

## Veil — inspect and request testnet tokens

Save as `balances.mts` and run `npx tsx balances.mts`:

```ts
import { client, account, network } from './authenticate.mts'

const balances = await client.getBalances()
console.log(JSON.stringify({ address: account.address, network, balances },
  (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2))
```

For an explicitly requested **new** testnet faucet request, save as `fund.mts`:

```ts
import { client, account, network } from './authenticate.mts'

if (network !== 'testnet') throw new Error('The faucet is testnet-only')
const result = await client.api.confirmAirdrop(account.address)
if (result.status === 'rate_limited') throw new Error(result.message)
if (!result.job.results.length || result.job.results.some(r => r.status !== 'accepted')) {
  throw new Error('Inspect the faucet job: one or more token transfers did not succeed')
}
console.log({ status: result.status })
```

Run with `npx tsx fund.mts`. Through the decorated client, `confirmAirdrop` waits for the faucet and, when a scanner is configured, its transfers' readable private records. A bare API client does not provide that same record check. Run `balances.mts` afterward and verify the required token.

This helper starts a new request; it is not a restart command. On a timeout, retain the job id reported by the error. Inspect it with `client.api.getAirdropStatus(jobId)` and recheck balances; do not rerun `fund.mts` blindly. An error without a known outcome requires checking the original funding attempt first.

## Python — inspect and request testnet tokens

Save as `balances.py` and run `python balances.py`:

```python
from authenticate import dex

print({"address": dex.profile.address, "network": dex.profile.network,
       "balances": dex.get_balances()})
```

Use `get_balances()` directly here. `status()` can fall back to public-only balances when private scanning fails, which would hide a funding-verification problem.

For an explicitly requested **new** faucet request, save as `fund.py`:

```python
from authenticate import dex

if dex.profile.network != "testnet":
    raise RuntimeError("The faucet is testnet-only")
result = dex.confirm_airdrop()
if not result.success:
    raise RuntimeError(result.error)
print({"status": result.status})
```

Run `python fund.py`, then `python balances.py`. Use `dex.confirm_airdrop()`, not `dex.api.confirm_airdrop(address)`, when record availability must be verified: the API-only method confirms the faucet job, not scanner indexing.

If the result is `records_pending`, inspect the reported transactions and scanner before another funding request. `AirdropPendingError` carries `job_id`; use `dex.api.get_airdrop_job(job_id)` to inspect that job. A rate limit or timeout is not a reason to loop the funding script.

For a known intended swap amount, `dex.has_swap_balance(token_id, "1.5")` checks for one covering unspent record without reserving it. Resolve `token_id` from `dex.api.get_token(symbol).address` and use the actual required amount, not the example value.

## Assets already on Aleo or another chain

For Aleo transfers, confirm the selected wallet's network, recipient, token, and private/public transfer mode. A public balance may require an additional supported conversion before it can fund a private swap.

For cross-chain funding, choose the source chain, asset, amount, destination account/network, and supported route before signing. The [Veil bridge guide](https://github.com/ProvableHQ/veil/blob/main/packages/bridge/skills/SKILL.md) supplies route-specific examples and checkpoint recovery. Its inspected examples target mainnet; they are not testnet faucets. For the AgentKit MCP, use the bridge recipe above and its documented route-specific validation limits.

Retain bridge checkpoints and inspect the original transfer after uncertain submission. Verify destination private records as well as bridge completion; do not bridge again just because the scanner is behind.

## Completion

Funding is ready when the intended account/network has the required asset in usable private records. Confirm record size when a particular operation requires one covering record. Balance and faucet checks do not prove that a later transaction's fee/proving path will succeed; report that separately rather than submitting a test trade as part of funding verification.

Return to the requested task. For a requested trade, continue to [swap](swap.md); otherwise stop here.
