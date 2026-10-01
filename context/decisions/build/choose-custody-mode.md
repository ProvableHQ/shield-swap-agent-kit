# Choose custody and signing

Choose where the signing authority lives before creating a client. DEX API access, scanning access, and transaction signing are separate permissions.

| Mode | How it works | Consequence |
| --- | --- | --- |
| Connected browser wallet | The wallet exposes an account and approves supported signing/proving requests. | The application should not hold a private key; pending operations must survive page reloads. |
| Local-key script or bot | A configured key signs through Veil or Python. | The process can spend under that key; enforce limits before signing and retain its store/journal. |
| Service serving many users | A separately authorized signer and state location is selected for each account. | Bind every job to the authenticated user, account, and network; never use a shared default profile for all users. |
| Read/quote-only service | Only the credentials needed for its data calls are configured. | A tool allowlist and signer restrictions enforce read-only operation; a prompt alone does not. |

Delegated proving is not a custody model by itself. Determine what the prover receives and who authorizes transactions. A local signer using hosted proving is different from giving a remote service a private key.

## Decide before configuration

Confirm the existing account or an explicitly requested new one, the target network, the signer owner, and the persistent state directory. Establish whether approvals are per operation or bounded unattended authority.

Keep private keys out of chat, logs, source control, and tool responses. Recovery handles and journals can contain claim secrets even when their filenames look like ordinary history. See [private-key handling](../../safety/private-key-handling.md).

For unattended authority, complete [the execution policy](../../safety/unattended-trading.md) before enabling writes. Exporting a wallet key is not an implicit fallback when a wallet lacks an operation.

Next: [configure account](../../shield-swap-setup/configure-account.md) when the requested build or test actually needs one.
