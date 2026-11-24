# Working on Shield Swap AgentKit

This file guides contributors. [AGENTS.md](AGENTS.md) starts the agent journey; [SKILL.md](SKILL.md) makes the root package discoverable by skill installers.

## Scope

Keep the main journey entrypoints in root `AGENTS.md` and `SKILL.md`, runbooks in top-level `context/`, and deterministic tools in `tools/`. Standalone installable skills belong in `skills/<skill-name>/`, with their references and helpers bundled inside each skill. Keep local references inside the repository so the root package works after installation. Do not move the shared `context/` tree under `skills/`.

SDKs own protocol logic, transaction construction, persistence, and signing. Use their public interfaces. Reuse the existing Shield Swap CLI when adding the kit's CLI integration. Add wrappers only when they provide a concrete workflow or validation benefit.

Use branch prefixes `docs/`, `ci/`, `feat/`, and `fix/` according to the change. Never use a `codex/` branch prefix.

No roadmap document is maintained here. Describe current functionality in the README and source evidence in [docs/source-map.md](docs/source-map.md).

## Authoring

- Identify the requested journey before account provisioning. Operational trading-tool integrations include account setup and funding; explicit code-only/read-only milestones can defer them. Preserve an explicit SDK, framework, custody choice, or existing authorization from the user's request.
- Account and Shield Swap configuration end with a link to funding. Standalone inspection uses `discover-pools-and-get-quotes.md`; `swap.md` retains its own discovery and quoting instructions. Do not remove those instructions when maintaining the standalone guide. Neither discovery path is a setup prerequisite. `shield-swap-setup/` retains the user's broad collection of operational runbooks; its files are not one mandatory sequence.
- Authentication grants access. Referrals are optional attribution. Never introduce an invite-code gate.
- State exactly what a command changes. A constructor or status workflow may create a profile or register a scanner; inspect the implementation before calling it read-only.
- Record SDK versions and source revisions when validating a workflow. An inspected checkout is not proof of a published release or a successful live run.
- Use SDK-native terminology and methods for each language. Do not invent cross-language parity or duplicate tool schemas already exported by the SDK.
- Write task-oriented context: explain the shared behavior, give complete CLI and SDK recipes, then show verification, failure handling, and the next step. A link to an API reference supplements the procedure; it does not replace it.
- Match the execution interface to the user's stack, custody model, existing setup, and required capabilities. Do not prescribe CLI-first routing. Keep Veil, Python, CLI, and available MCP paths explicit, without implying feature parity. Preserve the selected interface through the journey and document fallbacks for concrete capability gaps.
- Mark unavailable functionality explicitly. Do not add empty workflow files, placeholder servers, or installation commands for unpublished packages.
- Describe the actual privacy boundary: public-chain confidentiality does not imply that wallets, scanners, provers, or API operators learn nothing.
- Never commit private keys, account state, journals, credentials, or transaction handles containing claim material. Never add AI attribution to commits or documentation.

## Verification

Run `npm test` after changing context or validation. The validator supports this repository's inline Markdown links and single-line skill metadata; extend it deliberately if authoring conventions change.

The funding tests also require `python3` (Python 3.10 or newer). Their wallet-storage tests use the standard library and a mock credential store; they do not install SDK dependencies or access the OS keychain.

The setup-inspection tests use temporary account metadata, public wallet manifests, and controlled version probes. They cover missing metadata APIs, project/global package versions, empty environment sources, symlink handling, secret-free output, and execution from a copied kit. Keep their home and project paths isolated from real accounts. Native smoke checks may use installed metadata APIs with address-only fixture accounts; they do not need signing keys or a network.

The trading tests copy the Python and JavaScript modules into temporary consumer projects. Use Node 22.13 or newer for SQLite. To include the native SDK, Web3 ABI, and cross-language reservation checks, install the latest `shield-swap-sdk` and `web3` in an isolated Python environment, then run `TRADING_TEST_PYTHON=/absolute/path/to/venv/bin/python npm test`. Without those dependencies, the Python boundary checks are skipped. Typecheck the copied TypeScript assets with their package's `npm run check` after installing dependencies. These checks do not sign or send live transactions.

Set `TRADING_TEST_NODE_MODULES=/absolute/path/to/consumer/node_modules` to include copied Node TypeScript and browser-wallet typechecks and native SDK tests in `npm test`. That environment needs the published dependencies and development tools listed in the trading skill's asset packages. Browser tests use mocked wallet, API, chain, storage, and lock interfaces; they do not establish real wallet permissions, CORS, or funded execution. Keep independent agent-generated evaluation projects outside the repository.

For executable additions, verify the affected workflow from an installed copy outside SDK workspaces. Exercise the relevant failure paths, including process restart and uncertain submission results. Live transactions require authorization for the account, network, and intended action; a development task alone does not authorize them.

Before committing, inspect `git diff --check` and the staged files. Keep changes to upstream SDKs in their owning repositories.
