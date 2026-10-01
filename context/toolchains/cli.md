# CLI

Use the existing `@provablehq/shield-swap-cli` package, which installs the `shield-swap` command. AgentKit does not ship a second CLI. Pin an evaluated package version when setting up a repeatable workflow; inspect that version's help and [CLI reference](https://github.com/ProvableHQ/veil/tree/main/packages/shield-swap-cli).

Start with help, which does not provision an account:

```sh
shield-swap --help
shield-swap setup --help
shield-swap swap --help
```

## Account and state

Resolve build-versus-trade intent and the account choice before running setup. `setup --new` creates an account; importing a key must use a file or environment supplied outside the conversation. Setup may authenticate and request testnet funding. It is not merely a local installation check.

The inspected session uses `./.shield-swap/<network>/state.json`, with legacy state-path handling. Choose a deliberate persistent state location when invoking the command from different working directories. Keep its SDK identity store alongside the configured session as documented; it contains claim material. See [private keys and state](../safety/private-key-handling.md).

Authentication grants access and referrals are optional. Older versions and runbooks still mention mandatory invite codes. If that behavior appears, report the incompatible version and select a verified corrected release or SDK path. Never ask the user for an invite code to repair it.

## Operating the command

The current command registry includes pool and balance reads, swaps, concurrent swaps, history, positions, liquidity operations, and collection. Use `--json` where supported for structured results. Transaction commands such as `swap` have a planning path without `--execute`; use the installed help to check each command's actual behavior. Do not assume setup or every command is mutation-free merely because `--execute` is absent.

Session-backed reads can require a configured signer and DEX authentication even when they spend nothing. Do not create or fund an account solely to make an unrequested read path convenient.

For scripts intentionally sharing a CLI session, the package exports `loadSession` from `@provablehq/shield-swap-cli/session`. It reads configured key material, authenticates, and wires persistence. Applications can instead own a client through the [TypeScript SDK](typescript.md).

History reconciliation and pending claims support recovery. Inspect the original operation after a timeout; rerunning a swap command can submit a second trade. Apply [permissions](../safety/permissions.md) before executing any write.
