# GMGN

Status: GMGN exposes documented agent tooling; AgentKit does not yet connect it to Shield Swap. Sources checked 2026-10-01.

GMGN's official agent package supplies skills and a CLI for data, wallet information, swaps, and order workflows. Its setup uses a GMGN API key and an Ed25519 request-signing key for write capabilities. The older Solana routing API instead documents a route/unsigned-transaction/local-signing flow. Treat these as different integration surfaces; do not mix their credentials or parameters. [Agent package](https://github.com/GMGNAI/gmgn-skills), [legacy routing API](https://docs.gmgn.ai/index/cooperation-api-integrate-gmgn-solana-trading-api).

## Use the agent surface alongside Shield Swap

When the user selects GMGN, follow the official package's versioned installation/configuration instructions. Supply credentials through protected local configuration, not chat. A GMGN request-signing key is not an Aleo wallet key.

Begin with a read-only token/market query. Retain the chain and token address with the result; do not turn a matching symbol into an automatic Shield Swap asset mapping. Verify the destination token and route separately.

For a strategy using both venues, keep GMGN order IDs and Shield Swap operation IDs distinct. Poll the GMGN order through its documented status interface and complete the Shield Swap claim independently. A successful GMGN request is not proof of an on-chain fill.

## Connector requirements

Pin the chosen GMGN surface/version, confirm supported chains and request limits, and test its read and write permissions separately. Handle quote freshness, minimum output, percentage-versus-absolute sizing, and duplicate order requests explicitly.

Never forward GMGN's unsigned transaction to an Aleo signer. Likewise, installing GMGN skills does not add Aleo support to GMGN's routing engine. The missing connector is the orchestration and verified asset/inventory mapping between two existing execution paths.

Continue with [terminal integration](../decisions/trade/terminal-integration.md). For multi-venue execution, use the [arbitrage guide](../strategies/arbitrage.md).
