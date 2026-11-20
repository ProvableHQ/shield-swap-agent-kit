# Install the account and trading tools

Use the chosen application's environment, outside the installed skill. For Python, install the latest published `aleo-sdk` and `shield-swap-sdk` releases from PyPI. For Veil, use the `main` branch. Record the installed release versions or resolved source commit in the application's dependency records.

## Veil and the Shield Swap CLI

Use Node.js 22 or newer and pnpm. Veil is a workspace with several packages, so install packages built from its `main` checkout together. Do not use the repository root as an npm package.

From the consumer application's directory, use a fresh `.aleo-tools/veil` directory. If it already exists, inspect and reuse its checkout without overwriting local work. Exclude `.aleo-tools/` from the application's version control.

```sh
git clone --branch main --single-branch https://github.com/ProvableHQ/veil.git .aleo-tools/veil
pnpm --dir .aleo-tools/veil install --frozen-lockfile
pnpm --dir .aleo-tools/veil -r --workspace-concurrency=1 --filter '@provablehq/shield-swap-cli...' run build
mkdir -p .aleo-tools/packages
```

Pack the related workspace packages into the consumer's `.aleo-tools/packages` directory:

```sh
consumer_dir="$PWD"
for package in core devnode provable-sdk shield-swap shield-swap-cli; do
  pnpm --dir ".aleo-tools/veil/packages/$package" pack --pack-destination "$consumer_dir/.aleo-tools/packages"
done
npm install ./.aleo-tools/packages/*.tgz
npm install --save-dev tsx typescript @types/node
git -C .aleo-tools/veil rev-parse HEAD
npx --no-install shield-swap account --help
```

Keep these local package paths and the source checkout available for reinstalls. In a shared deployment, retain the built packages in its artifact store and lock those dependencies there. The commands reference local packages built from `main`; they do not substitute registry copies of the account SDK. Retain the application's existing package manager when adapting the install.

The account skill uses `npx --no-install shield-swap` to select this project's CLI. An existing `shield-swap` command on `PATH` can be used after checking that it is the intended installation. Veil scripts import `@provablehq/veil-aleo-sdk/node` from this same environment.

## Python

Use Python 3.10 or newer. Keep the application's virtual environment, or create one:

```sh
python -m venv .venv
. .venv/bin/activate
```

Install or upgrade both SDKs to the latest releases from PyPI:

```sh
python -m pip install --upgrade --only-binary=aleo-sdk aleo-sdk shield-swap-sdk
```

The binary-only option uses a prebuilt Aleo SDK wheel and prevents pip from starting a native build. If no wheel matches the environment, check the Python version and platform against the available PyPI wheels. Do not install Rust, clone the Python SDK, run a native build, or fall back to a Git dependency during onboarding.

Replace any Git, local-path, or editable SDK requirements with the PyPI package names. If this environment already has a source installation, reinstall the published packages so a higher development version does not prevent the upgrade command from selecting a release:

```sh
python -m pip install --upgrade --force-reinstall --only-binary=aleo-sdk aleo-sdk shield-swap-sdk
```

Keep `aleo-sdk` and `shield-swap-sdk` as PyPI dependencies in the application's requirements and record the resolved releases in its lockfile. Installation examples use unpinned package names so new setups receive the latest releases.

### Check account support and both networks

Check imports and account interfaces before using the setup helpers. This reads package metadata and imports modules; it creates no account and contacts no service:

```sh
python - <<'PY'
from importlib import import_module
from importlib.metadata import version
from inspect import signature

for package in ("aleo-sdk", "shield-swap-sdk"):
    print(f"{package}: {version(package)}")

missing = []
for module in ("aleo.mainnet", "aleo.testnet", "aleo.keystore"):
    try:
        import_module(module)
    except ImportError:
        missing.append(module)

from aleo_shield_swap import Profile
parameters = signature(Profile.load_or_create).parameters
missing.extend(f"Profile.load_or_create({name}=...)"
               for name in ("account", "create", "password") if name not in parameters)
if missing:
    raise SystemExit("Installed PyPI releases lack required setup support: " + ", ".join(missing))
print("Account setup and both networks are available")
PY
```

If a required module or interface is missing, report that specific capability gap before account creation or application setup. Keep the PyPI dependencies and existing account intact; do not work around the gap with a source build, a profile constructor that creates a replacement account, or a network change.
