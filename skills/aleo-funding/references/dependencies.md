# Prepare the funding tools

Run helpers in the chosen application, outside the installed skill. Preserve its language, package manager, and existing accounts. Resolve the [working folder and language](working-context.md) before installing dependencies or copying helpers, including for a guided transfer. This skill's JavaScript helpers are not a requirement for a Python application.

Check npm or PyPI before treating a missing account method as an SDK gap. Shared account support ships in Veil/CLI 0.17.0+ and Python 0.9.0+; install the latest stable release, not a pinned baseline. When the selected environment is outdated, upgrade it and retry the check without another approval question unless the environment requires one. Preserve accounts, wallet credentials, and transfer checkpoints. For explicitly read-only work, report the available upgrade instead. Do not clone or build an SDK locally to obtain these features.

## Python

Use the existing Python environment. Check installed versions against PyPI, then install or upgrade the SDKs needed for funding. Add `keyring` when creating local source wallets:

```sh
python -m pip show aleo-sdk aleo-bridge-sdk
python -m pip index versions aleo-sdk
python -m pip index versions aleo-bridge-sdk
python -m pip install --upgrade --only-binary=aleo-sdk aleo-sdk aleo-bridge-sdk
# For local source wallets:
python -m pip install --upgrade keyring
```

Use [native Python funding](python-funding.md) and copy `local_wallet.py` for local wallet creation. Node, npm, Veil builds, and a new JavaScript project are not needed. Keep the existing Aleo account and Python trading project. Dynamic's Python provider requires Python 3.11 or newer; check the existing interpreter before choosing it.

Use the installed Python SDK's quote, execution, and recovery APIs for the selected transfer. Recheck versions and imports after upgrading, using the same interpreter. Upgrade an existing `shield-swap-sdk` dependency from PyPI as well when account setup needs it. The binary-only option prevents a native Aleo build; if no wheel is available, check the supported Python/platform combination. An absent optional inspection method such as `pause_status` is not a reason to stop onboarding or switch languages. Handle the SDK's actual route and transaction results. Do not substitute a source build automatically.

## JavaScript and TypeScript: Veil packages

Use Node.js 22 or newer. The bridge logic remains in `@provablehq/aleo-bridge-sdk`. The remaining installation commands apply to this language choice or an explicitly accepted Node integration.

Check npm and the project's installed versions, then install or upgrade the published packages together. Retain the application's package manager; these examples use npm:

```sh
npm view @provablehq/aleo-bridge-sdk@latest version
npm view @provablehq/veil-aleo-sdk@latest version
npm ls @provablehq/aleo-bridge-sdk @provablehq/veil-aleo-sdk
npm install @provablehq/aleo-bridge-sdk@latest @provablehq/veil-core@latest @provablehq/veil-aleo-sdk@latest viem@latest
```

Replace old Git, local tarball, or linked SDK dependencies with registry packages while preserving the source checkout and unrelated work. Upgrade other Veil packages already used by the project to compatible latest releases. Record resolved versions in its lockfile and recheck imports before creating a wallet. A global CLI upgrade does not update these project dependencies. If the latest release still cannot supply a required capability, report the specific blocker; do not request a deposit or start a local build. Exclude funding state and credentials from application version control.

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

These are optional server dependencies for JavaScript/TypeScript. A provider account, credentials, and authorized wallet are separate from installing a package. Python uses its own provider adapters in the native funding guide.

Privy `0.35` declares an optional Solana Kit `^5.1` peer, while the bridge uses Kit 8. Its bridge adapter signs wire transactions and does not use Privy's Kit adapter. If npm rejects that combination, add the scoped override below to the application's existing `overrides` object before installing. Preserve other overrides. With pnpm, keep Kit 8 and inspect the peer warning. Do not downgrade the bridge's Kit dependency or disable all peer checks.

```json
{
  "overrides": {
    "@privy-io/node": { "@solana/kit": "^8.0.0" }
  }
}
```

## Check before creating a wallet

For JavaScript/TypeScript, copy the required `.mjs` helpers into the consumer project. `source-balances.mjs` needs no signer or keyring package. `local-wallet.mjs` uses the bridge SDK to derive and connect its locally generated signer. Neither installation nor a public balance check creates an account. Python uses the checks in its own guide.

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
