# Shield Swap MCP

Draft TypeScript MCP server for terminal users, backed by the published Veil 0.12.0 packages. Wallet configuration happens in a trusted terminal; MCP exposes structured trading tools. Implementation and mainnet validation are in progress.

## Run from this repository

Requires Node.js 22.13 or newer.

```sh
cd mcp
npm ci
npm run build
node dist/cli.js --help
```

The package is private and unpublished. To install the build elsewhere, run `npm pack` here, then `npm install /absolute/path/to/provablehq-shield-swap-mcp-0.1.0.tgz` in the consuming project. The installed command is `shield-swap-mcp`.

## Configure an existing wallet

Provide `SHIELD_SWAP_MCP_PASSWORD` through your secret manager, or let setup prompt for a hidden passphrase. Passphrases must have at least 12 characters.

```sh
node dist/cli.js setup --network mainnet --key-env ALEO_PRIVATE_KEY
```

This derives the address locally and creates a profile with execution disabled. It does not authenticate, fund, or trade. The default profile is `default`; choose another with `--profile NAME`.

By default, `--key-env` stores only the environment variable name. Supply the same key variable when starting MCP. Add `--store-key` to copy that key into encrypted storage instead. Omit `--key-env` to import an existing key through a hidden terminal prompt. `--generate` explicitly creates a new wallet and stores its key encrypted; it never replaces an existing profile.

State defaults to `~/.shield-swap-mcp`; override it with `--state-dir` or `SHIELD_SWAP_MCP_STATE_DIR`. Back up the entire state directory and keep its passphrase separately. Losing either can lose access to stored keys and pending recovery material.

Enable only the intended actions from the trusted terminal. Quote responses identify the exact token ID and base-unit amount used by limits:

```sh
node dist/cli.js configure --profile default --allow-claims
node dist/cli.js configure --profile default --allow-swaps --swap-limit TOKEN_ID=RAW_AMOUNT --max-slippage-bps 100
```

Replace `TOKEN_ID` and `RAW_AMOUNT` with a discovered token ID and the desired integer cap. Limits apply **per operation**, not per day or across a strategy. An absent or zero cap prevents execution for that token. Use `--deny-swaps`, `--deny-claims`, or `--deny-bridges` to revoke permissions. The MCP configuration tool cannot grant permissions, change signers, or set spending limits.

## Configure local bridge wallets

Use existing environment keys and explicit RPC endpoints:

```sh
node dist/cli.js configure --profile default --evm-key-env EVM_PRIVATE_KEY --evm-rpc-url https://your-ethereum-rpc.example
node dist/cli.js configure --profile default --solana-key-env SOLANA_PRIVATE_KEY --solana-rpc-url https://your-solana-rpc.example
node dist/cli.js configure --profile default --allow-bridges --bridge-limit ethereum/usdc=2000000
```

EVM accepts a hex private key; Solana accepts a JSON array of 64 keypair bytes. Configuration derives and stores the public address and environment reference locally. It does not broadcast or grant bridge permission unless explicitly requested. Solana routes currently require mainnet; Ethereum testnet uses Sepolia.

Use `list_bridge_routes` → `quote_bridge` → `execute_bridge`. Read progress with `bridge_status`, reconcile checkpoints with `recover_bridge_transactions`, and use `resume_operation` only for the SDK's required next step. Signed EVM/Solana transaction IDs are persisted before the RPC broadcast; Aleo uses the SDK's prepared-transaction checkpoints. A private xReserve mint retains its secret nonce encrypted for recovery.

## Connect an MCP client

Configure the client to run Node with an absolute path to the built entrypoint:

```json
{
  "mcpServers": {
    "shield-swap": {
      "command": "node",
      "args": ["/absolute/path/to/shield-swap-agent-kit/mcp/dist/cli.js", "serve"]
    }
  }
}
```

Inject `SHIELD_SWAP_MCP_PASSWORD` into the server process using the client's secret management. Profiles that reference environment keys also need those variables. Never paste keys or passphrases into tool arguments or a conversation.

The server uses stdio and does not open a listening port. It can start locked or unconfigured so clients can inspect the tool list and call `setup` for instructions. It never prompts on MCP stdin. SDK console diagnostics are suppressed because they can contain credential-bearing request data; stdout carries MCP messages only.

## Tools

| Workflow | Tools |
| --- | --- |
| Setup and configuration | `setup`, `get_config`, `update_config`, `list_wallets`, `get_wallet_status` |
| Markets and balances | `get_balances`, `list_tokens`, `list_pools` |
| Swaps | `quote`, `execute`, `swap_history`, `claim_unclaimed_swaps` |
| Bridges | `list_bridge_routes`, `quote_bridge`, `execute_bridge`, `bridge_status`, `recover_bridge_transactions` |
| Durable operations | `get_operation_status`, `list_operations`, `resume_operation` |

A quote retains the SDK's executable route, input, minimum output, and expiry. `execute` consumes it once and returns an operation ID. Reusing its idempotency key returns the same operation. Poll that operation after a timeout; never create another swap to recover an uncertain submission. Private swap outputs require a subsequent claim.

State is AES-256-GCM encrypted before SQLite writes it. Quotes, profiles, claim material, and bridge checkpoints belong to this local state; tool responses expose selected public fields. Per-wallet OS locks coordinate processes using the same state directory and release on process exit. SDK history recovery refreshes unresolved identities and expands incomplete scans on later polls.

Local encryption protects data at rest. An unlocked server can use configured signing credentials. The Veil integration uses a remote scanner and delegated prover, whose service boundaries still apply. `--fee-master` enables fee sponsorship only when the prover has granted that capability.

## Current limitations

- Local EVM and Solana bridge signers are wired to the SDK. Hosted Privy/Dynamic configuration is still in progress.
- Aleo bridge inputs currently use public balances. Private-record burns are not exposed. Inbound xReserve transfers support public, record, and private mint modes.
- Bridge quotes display SDK fees, which the SDK recalculates before execution; token input caps do not cap network gas fees.
- Bridge recovery requires this server's saved checkpoints. It does not import arbitrary external transactions.
- Coordination across profiles sharing an EVM or Solana wallet is still being completed.
- `rebalance_swap_inventory` is deferred until the SDK exposes that operation.
- No live transactions have been submitted by this implementation. It is not yet ready for funded use.
- History discovery probes a bounded identity window and reports incomplete coverage; it cannot promise discovery across arbitrary missing counter gaps.
- Existing Shield Swap CLI file stores do not share this package's encryption or locking. Do not operate the same wallet concurrently through an uncoordinated CLI or another state directory.
- Permission changes are refused while the profile has a queued or running operation.

## Development and verification

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests cover SDK quote retention, encrypted persistence, idempotency, delayed confirmations, submission uncertainty, concurrent recovery, OS lock release after a crash, terminal key import, and stdio restart. They use temporary test wallets without submitting transactions.

After installing the tarball into an independent project, run:

```sh
node scripts/smoke-installed.mjs /absolute/path/to/independent-project
```

This checks the installed SDK/WASM files, local key import, encrypted state, all 20 tool schemas over stdio, and restart. No real wallet material belongs in this repository.
