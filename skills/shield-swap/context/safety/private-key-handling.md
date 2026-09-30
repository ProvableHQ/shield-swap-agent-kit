# Private keys and persistent state

Choose custody from the requested application. Browser applications use the connected wallet. A local bot or service uses an explicitly configured signer. Read-only development should not create a wallet as an incidental setup step.

Resolve whether an existing account should be used before calling a helper that can generate a key. A Python profile constructor can create a key before `status()` runs; a missing local profile does not establish that the user has no account elsewhere.

Never ask for a private key, view key, API secret, or claim secret in chat. Use the selected wallet, secret store, or a key file/environment variable supplied outside the conversation. Check presence without printing values. Do not dump environment variables, profile contents, or API-token responses into logs or tool output.

Choose a persistent state location per account and network. Record the non-secret account address, network, and location so a new session can reconnect. Protect private files with appropriate permissions, exclude them from version control, and do not use them as test fixtures. TS and Python profiles are not interchangeable files; do not copy one over the other.

Swaps require durable recovery material. The TypeScript SDK supports a persistent blinded-identity store; Python supports a journal. Configure persistence before submission and retain it through claim and reconciliation. Transaction ids alone may not contain what is needed to claim an output.

Do not put account state inside the installed skill directory. Updating, reinstalling, or removing context must not remove access to funds. Avoid multiple processes sharing a state store unless the SDK explicitly supports that concurrency model.

Public-chain confidentiality has service boundaries. A wallet holds signing material, a scanner may need a view key, and proving/API services receive the data their protocols require. Explain the selected configuration's documented guarantees rather than promising invisibility to every participant.
