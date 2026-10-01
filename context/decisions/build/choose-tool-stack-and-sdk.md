# Choose the tool stack and SDK

Use the application's existing language and runtime. The SDKs remain the source of transaction construction, proving, signing, and recovery state; the kit teaches how to use them.

| Requirement | Choice | Guide |
| --- | --- | --- |
| TypeScript bot or service with its own signer | Veil + Shield Swap SDK | [TypeScript](../../toolchains/typescript.md) |
| Python bot, service, or notebook | Python Shield Swap SDK | [Python](../../toolchains/python.md) |
| Browser with wallet-controlled keys | Veil wallet integration + Shield Swap SDK | [TypeScript](../../toolchains/typescript.md) |
| Operate an account now | Existing JS CLI | [CLI](../../toolchains/cli.md) |
| Existing agent framework needs registered tools | SDK tool definitions or an available MCP connection | [MCP](../../toolchains/mcp.md) |
| Rust application | A deliberate process/service boundary until a verified native SDK path exists | [Rust](../../toolchains/rust.md) |

Do not require MCP to use either SDK. Conversely, an MCP-only consumer should not be instructed to run arbitrary Python or shell code unless its host actually provides that ability.

## Preserve the chosen interface

Choose once and carry the account, network, and recovery state through the journey. When a CLI capability is missing, the documented `loadSession` export lets a Veil script use the same account/store. Python profiles are not copies of CLI state.

A framework adapter should translate the framework's input/output format and call existing SDK methods. It should not reimplement quote math, build its own blinded-identity scheme, or make a second submission when a tool call times out.

Record the dependency versions and which capabilities were verified. Native SDK methods, CLI commands, and MCP catalogs differ; equal operation names do not establish equal behavior.

Next: [choose custody](choose-custody-mode.md). Installation instructions stay in the selected toolchain guide.
