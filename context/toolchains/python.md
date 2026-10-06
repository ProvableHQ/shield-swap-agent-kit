# Python

Use `shield-swap-sdk`, imported as `aleo_shield_swap`, for Python bots, notebooks, and services. A new one-account bot follows [Build a one-account bot](../decisions/trade/bot-integration.md#build-a-one-account-bot) before these install steps. The package depends on `aleo-sdk` and requires Python 3.10 or newer. The inspected persistent journal uses POSIX file locking; use macOS, Linux, or WSL for these profile-based recipes.

## Install in the application

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install shield-swap-sdk
python -m pip show shield-swap-sdk aleo-sdk
```

Record the resolved versions in the project's dependency lock or requirements file. These recipes were checked against the source version in the [source map](../../docs/source-map.md); the installed package can print its full API reference:

```sh
python -m aleo_shield_swap
```

That command prints documentation. It does not construct a client or create an account.

## Client and runbook conventions

[Configure account](../shield-swap-setup/configure-account.md) supplies `session.py`, which exports a profile-bound `dex`. [Configure Shield Swap](../shield-swap-setup/configure-shield-swap.md) supplies `authenticate.py`. Later scripts import `dex` from that module and run with `python filename.py`.

Choose the profile directory before constructing a client. `ShieldSwap.from_profile()` creates a profile if it is missing, attempts scanner registration, and attaches a durable journal. The supplied session recipe checks the profile first so an existing-account request cannot silently generate a new key.

Profiles default to `SHIELD_SWAP_HOME` or `~/.shield-swap`. Existing profiles retain their stored network and endpoint; a `network=` argument does not migrate them. Keep each account/network in its own profile directory, outside the installed kit.

## Execution model

`dex.quote(...)` performs API reads and returns a quote. `dex.swap(quote)` prepares a call; `.delegate(wait=True)` submits through delegated proving and waits for confirmation. Claiming is another call and transaction. The [swap recipe](../shield-swap-setup/swap.md) shows both, with journaling enabled.

`dex.onboard()` combines authentication, optional referral attribution, credential stages, and funding. Use the narrower authentication recipe when only configuration is requested. The profile constructor and onboarding are not installation smoke tests.

For the existing Python stdio server, see [MCP](mcp.md). Its tool coverage differs from the Python SDK; a method being available in Python does not mean an equivalent MCP tool exists.
