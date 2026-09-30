# Python

Use `shield-swap-sdk`, imported as `aleo_shield_swap`, for Python services, notebooks, and bots. The inspected package requires Python 3.10 or newer and depends on `aleo-sdk`. Record the installed versions before implementing a flow.

Once installed, read the version's bundled agent reference:

```sh
python -m aleo_shield_swap
```

That command prints documentation. The [SDK repository](https://github.com/ProvableHQ/python-sdk/tree/master/shield-swap-sdk) also contains the package README and examples. Prefer the installed reference for exact method signatures. This kit does not duplicate the generated API guide.

## Decide account and profile first

`ShieldSwap.from_profile()` creates or loads a signing profile and attempts scanner setup. Calling it before `status()` is not a passive check for an existing account.

Resolve the account, network, and profile location first. Profiles default to `SHIELD_SWAP_HOME` or `~/.shield-swap`; an existing profile retains its configured network and endpoint. The SDK supports importing a key through `SHIELD_SWAP_PRIVATE_KEY_FILE` or `SHIELD_SWAP_PRIVATE_KEY` supplied outside the conversation. See [private keys and state](../safety/private-key-handling.md).

Use the profile lifecycle only when operating that account is in scope. A builder choosing a library does not need onboarding. Authentication grants access; a referral passed to `onboard()` is optional attribution.

## SDK lifecycle

The inspected SDK offers `dex.quote(...)`, `dex.swap(quote).delegate(...)`, and `dex.claim_swap_output(...).delegate(...)`. Quotes take human decimal strings; returned handles and low-level transaction fields use base units. Preserve quote constraints and use the installed guide for exact parameters and finalization waits.

Enable persistent journaling before adopting the first-swap example: the inspected example defaults journaling off. An in-memory handle is insufficient for recovery across process restarts. Inspect the original transaction and journal after an uncertain submission rather than rerunning the whole example.

Profile, batch, collection, and async support are not interchangeable. Check the selected interface's actual capabilities rather than assuming every synchronous method has an asynchronous counterpart.

For the package's existing stdio server, read [MCP](mcp.md) before launch. For transaction authority and retry boundaries, read [permissions](../safety/permissions.md).
