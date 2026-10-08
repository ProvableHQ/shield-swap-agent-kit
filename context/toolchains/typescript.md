# TypeScript / Veil

Use Veil for TypeScript applications and custom trading scripts. Choose the client by where the signing key lives. A new one-account bot follows [Build a one-account bot](../decisions/trade/bot-integration.md#build-a-one-account-bot) before these install steps.

| Application | Packages |
| --- | --- |
| Local-key bot, script, or service | `@provablehq/veil-aleo-sdk` and `@provablehq/shield-swap-sdk` |
| React application with a connected wallet | `@provablehq/veil-aleo-react-hooks`, supported wallet adapters, and `@provablehq/shield-swap-sdk` |
| Non-React application with a connected wallet | `@provablehq/veil-aleo-wallet-adapter` and `@provablehq/shield-swap-sdk` |
| Script extending a CLI session | `@provablehq/shield-swap-cli/session`; see [CLI session reuse](cli.md#reuse-a-cli-account-from-a-script) |

## Install for a local-key application

Use Node.js 22 or newer for these examples. In the application's directory:

```sh
npm install @provablehq/veil-aleo-sdk @provablehq/shield-swap-sdk
npm install --save-dev tsx typescript @types/node
npm ls @provablehq/veil-aleo-sdk @provablehq/shield-swap-sdk
```

Retain the lockfile and record the resolved versions. The [source map](../../docs/source-map.md) records the versions used to check these recipes.

Use `.mts` for the example scripts so imports and top-level `await` run as ESM:

```sh
npx tsx filename.mts
```

## Client and runbook conventions

[Configure account](../shield-swap-setup/configure-account.md) supplies a complete `session.mts` that exports `client`, `account`, and `network`. Subsequent recipes import that module. It loads the selected key and network and attaches a persistent `swapFileStore`; it does not authenticate, fund, or trade.

[Configure Shield Swap](../shield-swap-setup/configure-shield-swap.md) adds an `authenticate.mts` module. Funding and trading scripts import that module so a new process establishes its own DEX session.

The default Provable edge gateway handles proving and record scanning without consumer registration. DEX authentication is a separate signed challenge. Preserve the same client and store while a process is running; rebuilding them for every call adds setup work and risks using different state.

The local-key recipes do not apply to a browser wallet. A browser uses the connected wallet's account and signing path, not a private-key environment variable or Node file store. Use the [wallet integration reference](https://github.com/ProvableHQ/veil/tree/main/packages/wallet-adapter) for that client; the [SDK reference](https://github.com/ProvableHQ/veil/tree/main/packages/shield-swap) documents compatible DEX actions.

## Agent frameworks

The SDK's `/agent` entrypoint exports `createShieldSwapAgentTools()` to bind existing tool schemas and handlers to a client. Its `/mcp` entrypoint is a dispatcher, not a running transport; see [MCP](mcp.md). These are integration choices, not prerequisites for using the SDK directly.
