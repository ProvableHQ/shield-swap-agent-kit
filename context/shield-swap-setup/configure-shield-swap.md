# Configure Shield Swap

Use the account selected in [configure account](configure-account.md). Configure the DEX endpoint for that network and authenticate using the selected SDK or wallet.

- TypeScript exposes `client.authenticateShieldSwap()` on a composed Shield Swap client. Follow the installed package's reference for client construction and session handling.
- Python exposes authentication through `dex.api`; its profile onboarding combines several lifecycle stages. Do not call a combined onboarding helper as configuration-only when it also requests funding.
- For CLI or MCP, inspect the installed tool's actual setup behavior and account binding before invocation.

Authentication grants DEX access. Referral codes are optional attribution: use one only when the user supplies or requests it. Do not ask for an invite code or treat the absence of a referral as an error. An older tool that enforces an invite gate needs a corrected release or a verified SDK path.

DEX authentication is separate from proving and scanning. The default Provable edge gateway does not require consumer registration. Configure service credentials only when the chosen service actually requires them. Keep any durable API token in the account's protected state, outside the kit.

Configuration is complete when the intended account, network, endpoint, and session are established. Discovery and quoting are part of the swap flow, not checks that gate configuration.

Next: [fund the account](bridge-funds.md). Do not start a trade as a setup check.
