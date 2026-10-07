# Shield Swap MCP

Draft implementation of a TypeScript MCP server backed by Veil. This subfolder is under active development and is not ready for funded use.

## Current implementation

- Strict MCP input schemas and structured responses for the agreed trading interface.
- Encrypted local SQLite state, atomic quote consumption, per-wallet operating-system locks, and durable operation IDs.
- Locally enforced swap/claim permissions and token input limits.
- Veil 0.12 executable quote integration, swap submission, balance reads, stored swap history, and claim workflow.
- Secrets remain outside MCP arguments and tool results; SDK claim material is persisted encrypted.

## Current limitations

- Terminal setup, CLI entrypoint, build, and installed-package validation are not implemented yet. CLI tests currently fail for the missing entrypoint.
- The bridge tool contracts are present, but bridge execution and hosted-wallet wiring are incomplete.
- Recovery refreshes unresolved SDK history, expands incomplete scans, and tracks the proving boundary. Live recovery validation is still pending.
- Existing Shield Swap CLI file stores do not participate in this package's encryption or locking. Do not operate the same wallet concurrently through an uncoordinated CLI or another state directory.
- `rebalance_swap_inventory` is deferred until the SDK exposes the operation.
- No live transactions have been submitted by this implementation.

## Development

From this directory, run `npm ci`, `npm test`, and `npm run typecheck`. The package uses Node.js 22.13 or newer and pins the published Veil packages to 0.12.0. The advertised build command is pending its implementation.

The server functions are in `src/trading/`; tests use temporary local state and deterministic SDK boundary fixtures. Never put real keys, passphrases, wallet state, or recovery handles in this repository.
