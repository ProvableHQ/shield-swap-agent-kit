# Configure an account

Establish the account, custody mode, network, and persistent state location required by the task. A builder selecting an SDK can defer this step until an authorized operation or test needs an account.

1. Reuse the user's existing account or connected wallet. Resolve an unknown account choice before invoking anything that can generate a private key.
2. Select the requested network. Do not assume a profile can be moved between networks by changing an endpoint.
3. Follow the selected [TypeScript](../toolchains/typescript.md), [Python](../toolchains/python.md), or [CLI](../toolchains/cli.md) account procedure. The [MCP guide](../toolchains/mcp.md) describes which existing servers bind a signer on startup.
4. Configure durable state outside the installed kit. Confirm the non-secret account address and network without printing key material or profile contents.

Apply [private-key handling](../safety/private-key-handling.md). Python's `from_profile()` can create a profile and attempt scanner setup; it is not a passive account-existence check. TS and Python profiles are not interchangeable files.

Account configuration does not select a trade, discover pools, request a quote, or move funds. If an existing SDK helper also funds an account, include that effect in the requested scope or use its documented lower-level configuration path.

Next: [configure Shield Swap](configure-shield-swap.md).
