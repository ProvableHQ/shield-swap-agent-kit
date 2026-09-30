# Permissions

Match the operation to the user's request and existing authorization. Preserve choices already made; ask only for a missing consequential decision.

| Request | Allowed task scope |
| --- | --- |
| Explain, choose a stack, or build an integration | Read reference material and work on the requested code. Account creation, funding, and live trades are separate actions. |
| Inspect balances, pools, or a quote | Perform the requested reads using the selected account if needed. Authentication can sign a challenge or update a local session; it does not authorize a trade. |
| Execute a specified trade | Apply the authorized account, network, amount, route constraints, and slippage. Complete its required claim and verify the result within that scope. |
| Run unattended trading | Use explicitly configured assets, size/spend limits, strategy bounds, and stop conditions. A skill prompt is not enforcement; the execution layer must apply those limits. |

Access is granted by DEX authentication. Referrals are optional attribution. Never block setup or trading on an invite code, and do not introduce a referral on the user's behalf without their instruction.

Treat account creation, funding requests, API-token creation/revocation, liquidity changes, bridging, and claims as state changes. A function named `setup`, `status`, or `from_profile` may have additional effects; read the selected implementation's documented behavior.

Quotes spend no funds, though the selected service may require authentication. Preserve an executable quote's expiry, route, and minimum output. A fresh quote outside the user's approved bounds needs a new decision; it is not permission to relax those bounds.

Distinguish rejected, submitted, confirmed, finalized, and claimed operations using the selected SDK's actual status information. An uncertain response or timeout is not proof of rejection. Check the original transaction and durable journal/store before attempting another write. Keep retry behavior specific to the operation and documented error.

For MCP, enforce permissions in the server or signing layer. Do not call a catalog read-only merely because trade tools were hidden if token management, onboarding, or other mutations remain exposed.
