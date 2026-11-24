# Install the account and trading tools

Use the chosen application's environment, outside the installed skill. Install published releases from npm for Veil and the Shield Swap CLI, or PyPI for Python. Record the resolved versions in the application's dependency records.

## Check releases before repairing an installation

Shared account support is available in Veil and Shield Swap CLI **0.17.0+**, and Python SDK **0.9.0+**. These are feature baselines, not install pins. Check the registry for the latest stable release each time an installed version is outdated or an account command/import is missing. An older installation is not evidence that the feature needs a source build.

1. Identify the executable or package the selected project actually uses, including its version and location. A global CLI upgrade does not update a project-local CLI; a different Python environment does not update this project's SDK.
2. Compare it with npm or PyPI using the commands below. If outdated, upgrade that installation to the latest release, retaining the package manager, project, account, network, and recovery state. Do this as part of setup or repair without another approval question unless the environment requires one. For an explicitly read-only request, report the available upgrade instead.
3. Recheck the resolved version/path and retry the failed metadata read or capability check. Replace old Git, tarball, linked, or local-path SDK dependencies with registry packages; preserve the original checkout and unrelated local work. Keep related Veil dependencies compatible and update the project's lockfile.

Do not clone an SDK, build a local checkout, or change languages to obtain these account features. If the registry cannot be reached, installation fails, or the latest published release still lacks the required capability, report that specific blocker and preserve the existing account. Source development is a separate, explicitly requested task.

## Veil and the Shield Swap CLI

Use Node.js 22 or newer. Check the packages needed by the selected interface:

```sh
npm view @provablehq/veil-aleo-sdk@latest version
npm view @provablehq/shield-swap-sdk@latest version
npm view @provablehq/shield-swap-cli@latest version
npm ls @provablehq/veil-aleo-sdk @provablehq/shield-swap-sdk @provablehq/shield-swap-cli
```

For a Veil application, install or upgrade its SDK dependencies in the application directory. Retain its existing package manager; these examples use npm:

```sh
npm install @provablehq/veil-core@latest @provablehq/veil-aleo-sdk@latest @provablehq/shield-swap-sdk@latest
npm install --save-dev tsx typescript @types/node
```

For a project-local CLI, install or upgrade it there and verify that binary:

```sh
npm install @provablehq/shield-swap-cli@latest
npx --no-install shield-swap --version
npx --no-install shield-swap account --help
```

For an existing global npm CLI, update the global installation instead:

```sh
command -v shield-swap
npm ls --global @provablehq/shield-swap-cli
npm install --global @provablehq/shield-swap-cli@latest
shield-swap --version
shield-swap account --help
```

Use the package manager that owns the detected global installation. If the old command still resolves first, correct the selected invocation or PATH rather than repeatedly upgrading another copy. Do not remove unrelated installations. A CLI-only workflow does not need a separate SDK project; scripts that import SDKs do need those project dependencies.

The account skill uses `npx --no-install shield-swap` for a project-local CLI. Use `shield-swap` instead when the verified global CLI was selected. Veil scripts import `@provablehq/veil-aleo-sdk/node` from the application environment. After an SDK upgrade, check the installed account exports without loading a key:

```sh
node --input-type=module -e 'import { accountInfo, loadAccount } from "@provablehq/veil-aleo-sdk/node"; console.log({ accountInfo: typeof accountInfo, loadAccount: typeof loadAccount })'
```

## Python

Use Python 3.10 or newer. Keep the application's virtual environment, or create one:

```sh
python -m venv .venv
. .venv/bin/activate
```

Check the installed versions and current PyPI releases using that same interpreter:

```sh
python -m pip show aleo-sdk shield-swap-sdk
python -m pip index versions aleo-sdk
python -m pip index versions shield-swap-sdk
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

If a required module or interface is missing, check PyPI, upgrade an outdated installation, and rerun this check before declaring a capability gap. Python account setup needs the 0.9.0+ interfaces; if the available release is still older, report that concrete blocker. Keep the published dependencies and existing account intact; do not work around the gap with a source build, a profile constructor that creates a replacement account, or a network change.
