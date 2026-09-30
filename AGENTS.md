# Working on Shield Swap AgentKit

This file guides contributors. The installed agent entrypoint is [skills/shield-swap/SKILL.md](skills/shield-swap/SKILL.md).

## Scope

Maintain the installed context under `skills/shield-swap/`. Keep every local file it requires inside that directory so the skill works after installation outside this repository. Repository documentation belongs outside the installed skill.

SDKs own protocol logic, transaction construction, persistence, and signing. Use their public interfaces. Keep the existing Shield Swap CLI in its owning repository. Add wrappers only when they provide a concrete workflow or validation benefit.

No roadmap document is maintained here. Describe current functionality in the README and source evidence in [docs/source-map.md](docs/source-map.md).

## Authoring

- Route builders and traders before account provisioning. Preserve an explicit SDK, framework, custody choice, or existing authorization from the user's request.
- Authentication grants access. Referrals are optional attribution. Never introduce an invite-code gate.
- State exactly what a command changes. A constructor or status workflow may create a profile or register a scanner; inspect the implementation before calling it read-only.
- Record SDK versions and source revisions when validating a workflow. An inspected checkout is not proof of a published release or a successful live run.
- Use SDK-native terminology and methods for each language. Do not invent cross-language parity or duplicate tool schemas already exported by the SDK.
- Keep context concise. Link to the installed SDK's reference or maintained documentation for full signatures.
- Mark unavailable functionality explicitly. Do not add empty workflow files, placeholder servers, or installation commands for unpublished packages.
- Describe the actual privacy boundary: public-chain confidentiality does not imply that wallets, scanners, provers, or API operators learn nothing.
- Never commit private keys, account state, journals, credentials, or transaction handles containing claim material. Never add AI attribution to commits or documentation.

## Verification

Run `npm test` after changing context or validation. The validator supports this repository's inline Markdown links and single-line skill metadata; extend it deliberately if authoring conventions change.

For executable additions, verify the affected workflow from an installed copy outside SDK workspaces. Exercise the relevant failure paths, including process restart and uncertain submission results. Live transactions require authorization for the account, network, and intended action; a development task alone does not authorize them.

Before committing, inspect `git diff --check` and the staged files. Keep changes to upstream SDKs in their owning repositories.
