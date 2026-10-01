# Working on Shield Swap AgentKit

This file guides contributors. [AGENTS.md](AGENTS.md) starts the agent journey; [SKILL.md](SKILL.md) makes the root package discoverable by skill installers.

## Scope

Maintain the user's layout: journey entrypoint in `AGENTS.md`, runbooks in top-level `context/`, deterministic tools in `tools/`, and executable CLI, MCP, and examples in their respective top-level directories when implemented. Keep local references inside the repository so the root package works after installation. Do not move the source context under a `skills/` wrapper.

SDKs own protocol logic, transaction construction, persistence, and signing. Use their public interfaces. Reuse the existing Shield Swap CLI when adding the kit's CLI integration. Add wrappers only when they provide a concrete workflow or validation benefit.

Use branch prefixes `docs/`, `ci/`, `feat/`, and `fix/` according to the change. Never use a `codex/` branch prefix.

No roadmap document is maintained here. Describe current functionality in the README and source evidence in [docs/source-map.md](docs/source-map.md).

## Authoring

- Route builders and traders before account provisioning. Preserve an explicit SDK, framework, custody choice, or existing authorization from the user's request.
- Account and Shield Swap configuration end with a link to funding. Standalone inspection uses `discover-pools-and-get-quotes.md`; `swap.md` retains its own discovery and quoting instructions. Do not remove those instructions when maintaining the standalone guide. Neither discovery path is a setup prerequisite. `shield-swap-setup/` retains the user's broad collection of operational runbooks; its files are not one mandatory sequence.
- Authentication grants access. Referrals are optional attribution. Never introduce an invite-code gate.
- State exactly what a command changes. A constructor or status workflow may create a profile or register a scanner; inspect the implementation before calling it read-only.
- Record SDK versions and source revisions when validating a workflow. An inspected checkout is not proof of a published release or a successful live run.
- Use SDK-native terminology and methods for each language. Do not invent cross-language parity or duplicate tool schemas already exported by the SDK.
- Write task-oriented context: explain the shared behavior, give complete CLI and SDK recipes, then show verification, failure handling, and the next step. A link to an API reference supplements the procedure; it does not replace it.
- Default immediate trading to the existing CLI until the AgentKit MCP server is available. Keep Veil and Python as native builder paths. Select the interface once and preserve it through the journey; document explicit fallbacks for unsupported operations.
- Mark unavailable functionality explicitly. Do not add empty workflow files, placeholder servers, or installation commands for unpublished packages.
- Describe the actual privacy boundary: public-chain confidentiality does not imply that wallets, scanners, provers, or API operators learn nothing.
- Never commit private keys, account state, journals, credentials, or transaction handles containing claim material. Never add AI attribution to commits or documentation.

## Verification

Run `npm test` after changing context or validation. The validator supports this repository's inline Markdown links and single-line skill metadata; extend it deliberately if authoring conventions change.

For executable additions, verify the affected workflow from an installed copy outside SDK workspaces. Exercise the relevant failure paths, including process restart and uncertain submission results. Live transactions require authorization for the account, network, and intended action; a development task alone does not authorize them.

Before committing, inspect `git diff --check` and the staged files. Keep changes to upstream SDKs in their owning repositories.
