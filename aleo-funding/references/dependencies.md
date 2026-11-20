# Prepare the funding tools

Run helpers in the chosen application, outside the installed skill. Keep that application's package manager and existing Veil installation. Use Node.js 22 or newer. The bridge logic remains in `@provablehq/aleo-bridge-sdk`; this skill supplies balance inspection, local credential storage, and the funding conversation.

## Veil packages

Use Veil `main`, matching account setup. If the application already has that checkout, reuse it after checking its revision and local changes. For a fresh installation:

```sh
git clone --branch main --single-branch https://github.com/ProvableHQ/veil.git .aleo-tools/veil
pnpm --dir .aleo-tools/veil install --frozen-lockfile
pnpm --dir .aleo-tools/veil -r --workspace-concurrency=1 --filter '@provablehq/aleo-bridge-sdk...' --filter '@provablehq/veil-aleo-sdk...' run build
mkdir -p .aleo-tools/packages
```

Pack and install the related packages together from the consumer directory:

```sh
consumer_dir="$PWD"
for package in core devnode provable-sdk bridge; do
  pnpm --dir ".aleo-tools/veil/packages/$package" pack --pack-destination "$consumer_dir/.aleo-tools/packages"
done
npm install ./.aleo-tools/packages/*.tgz
npm install viem@latest
git -C .aleo-tools/veil rev-parse HEAD
```

Keep the local packages available for reinstalls. Exclude `.aleo-tools/`, funding state, and credentials from application version control. Use an existing compatible SDK installation for balance reads. Record resolved versions and source revisions in the application's dependency records.

For local wallet storage, install `@napi-rs/keyring@latest`. For Solana, also install the bridge SDK's compatible `@solana/kit@^8` peer. The helpers use the OS credential store. On Linux, require Secret Service; the in-memory kernel fallback cannot retain a deposit key across reboot. If the installed keyring package lacks the `linux.store` option, stop and upgrade it before creating a Linux wallet.

```sh
npm install @napi-rs/keyring@latest
npm install '@solana/kit@^8'
```

Install only the selected provider for hosted wallets, using versions compatible with the installed bridge package's peer dependencies:

```sh
npm install '@privy-io/node@^0.35.0'
# Or, for Dynamic EVM; add node-svm for Solana:
npm install '@dynamic-labs-wallet/node-evm@^1.1.24'
```

These are optional server dependencies. A provider account, credentials, and authorized wallet are separate from installing a package. No Python SDK build is required. A Python application may invoke the Node bridge helper as a separate process while keeping its existing Aleo account and recovery state.

Privy `0.35` declares an optional Solana Kit `^5.1` peer, while the bridge uses Kit 8. Its bridge adapter signs wire transactions and does not use Privy's Kit adapter. If npm rejects that combination, add the scoped override below to the application's existing `overrides` object before installing. Preserve other overrides. With pnpm, keep Kit 8 and inspect the peer warning. Do not downgrade the bridge's Kit dependency or disable all peer checks.

```json
{
  "overrides": {
    "@privy-io/node": { "@solana/kit": "^8.0.0" }
  }
}
```

## Check before creating a wallet

Copy this skill's `scripts/` into the consumer project together. `source-balances.mjs` needs no signer or keyring package. `local-wallet.mjs` uses the bridge SDK to derive and connect its locally generated signer. Neither installation nor a public balance check creates an account.

```sh
node --input-type=module - <<'JS'
import { DEFAULT_BRIDGE_REGISTRY } from '@provablehq/aleo-bridge-sdk'
console.log({ registry: DEFAULT_BRIDGE_REGISTRY.version })
for (const chain of ['ethereum', 'base', 'arbitrum', 'arc', 'solana']) {
  console.log(chain, DEFAULT_BRIDGE_REGISTRY.getRoutes({ environment: 'mainnet', sourceChainId: chain })
    .filter(route => route.availability === 'active').map(route => route.id))
}
JS
```

Missing routes or wallet adapters are a capability gap. Do not invent a transfer path, silently change the chain, or request a deposit before resolving it.
