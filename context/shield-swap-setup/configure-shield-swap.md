# Configure Shield Swap

Authenticate the account selected in [configure account](configure-account.md) and verify that the client targets the intended network. This step does not place a trade.

## What configuration means

Shield Swap authentication signs a challenge to prove account ownership. It grants DEX access; **invite codes are not required and referrals are optional**. It is separate from proving and scanning: the default Provable edge gateway needs no consumer registration or JWT provisioning.

An authenticated account may still have no spendable private records. Configure access here, then check funding when needed. Standalone [discovery and quoting](discover-pools-and-get-quotes.md) does not require funding; the [swap flow](swap.md) also includes discovery and quoting for a complete trade.

Read only the section for the selected interface. The SDK recipes continue the `session.mts` or `session.py` created on the account page.

## CLI — default for immediate trading

If setup has not run and its combined authentication/token/funding effects are wanted:

```sh
shield-swap setup --network testnet
```

Otherwise verify the existing session with a balance read:

```sh
shield-swap balances --network testnet --all --json
```

Operational commands load and authenticate the existing session. A balance read does not mint a token, request funds, or submit a swap. Check the returned `address` and `network`; zero holdings mean funding may be needed, not that authentication failed.

The inspected `setup` command still checks an obsolete invite gate. If it returns `NEEDS_INVITE_CODE`, use the [CLI session fallback](../toolchains/cli.md#reuse-a-cli-account-from-a-script) and the Veil recipes below. Do not obtain a code to satisfy outdated behavior. No separate `configure` subcommand is assumed here.

## Veil — authenticate without funding

Save as `authenticate.mts` in the same application directory:

```ts
import { client, account, network } from './session.mts'

await client.authenticateShieldSwap()
export { client, account, network }
```

Run `npx tsx authenticate.mts`. Success establishes the client's DEX session. Do not log its credentials. Later scripts import this module so a new process authenticates its own client; imports within one process reuse the module.

For optional referral attribution, only when the user supplies a code and wants to use it:

```ts
import { client } from './authenticate.mts'

const code = process.env.SHIELD_SWAP_REFERRAL_CODE
if (!code) throw new Error('No referral supplied')
const status = await client.api.getReferralStatus()
if (!status.referred_by) await client.api.redeemReferralCode(code)
```

`SHIELD_SWAP_REFERRAL_CODE` is an input to this recipe, not an SDK configuration variable. Skip the whole referral step when no attribution is requested. An existing referrer is not replaced.

## Python — authenticate without onboarding

Save as `authenticate.py` beside `session.py`:

```python
import aleo
from session import dex

network = getattr(aleo, dex.profile.network)
key = network.PrivateKey.from_string(dex.profile.private_key)
dex.api.authenticate(
    dex.profile.address,
    lambda message: str(key.sign(message.encode())),
)
```

Run `python authenticate.py`. Later scripts use `from authenticate import dex`. This establishes an API session without invoking `dex.onboard()`, requesting funds, or submitting a transaction.

For optional referral attribution only:

```python
import os
from authenticate import dex

code = os.environ["SHIELD_SWAP_REFERRAL_CODE"]
status = dex.api.referral_status()
if not status.referred_by:
    dex.api.redeem_code(code)
```

Python authentication can return a CSRF token tied to cookies in the current HTTP session, or a JWT on older deployments. Do not save the return value as a reusable API token. The profile's durable API-token storage is a separate mechanism; these recipes authenticate each process instead of minting extra tokens.

## Verify and diagnose

Successful authentication establishes API access, not proof that the scanner or prover works. A balance read additionally exercises record scanning; if it fails, diagnose that error separately rather than recreating the wallet.

- **401 or expired session:** authenticate the selected client again. Check for an explicitly configured stale API token.
- **404 or unreachable DEX API:** check network and endpoint overrides. The CLI can pin an API origin in state or override it with `SHIELD_SWAP_API_URL`; only change it to a verified deployment for that network.
- **Invite-code prompt:** use the SDK fallback above. Authentication grants access without referral attribution.
- **No funds:** continue to funding; do not use a swap as an authentication check.

Next: [fund the account](bridge-funds.md). If the CLI already requested an airdrop, inspect that job and its records instead of starting another request.
