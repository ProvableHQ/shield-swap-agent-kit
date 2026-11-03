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

## AgentKit MCP execution access

New profiles start with swaps, claims, bridges, and inventory disabled. DEX authentication and execution permission are separate: a configured account can inspect balances, discover markets, and obtain quotes without granting any of these permissions. `setup` reports the selected profile's policy under `checks.execution`; `get_config` reads it again when needed.

Guide access from the user's task. Explain what the next action needs and what it will allow before calling `request_permissions`. Preserve existing grants and limits; propose only missing access or a limit change the user wants.

| Intended action | Access to request |
| --- | --- |
| Inspect, quote, or plan inventory | None |
| Submit a swap and collect its output | `swaps` and `claims`, a `swapLimits` entry for the discovered input token, and the intended maximum slippage |
| Claim an existing swap | `claims` |
| Fund through a bridge | `bridges` and a `bridgeLimits` entry for the quoted source asset; signing-wallet configuration stays in the trusted terminal |
| Execute joins/splits, enable replenishment, or rebroadcast saved proved transactions | `inventory`; explain ongoing maintenance authority and fees before requesting it |

`request_permissions` takes `profileId`, optional `permissions: { swaps, claims, bridges, inventory }`, `swapLimits: [{ token, amount }]`, `bridgeLimits: [{ asset, amount }]`, and `maxSlippageBps`. Supply only the fields being changed. Limits use exact discovered IDs and integer **base-unit** strings; they merge with existing limits. Zero disables an asset. Limits apply per operation, not across a day or strategy. Claims and inventory have no separate amount or fee cap.

The tool shows the account, network, current policy, and proposed policy in the MCP client's confirmation form. The user must explicitly approve there. Tool arguments, chat assent, and an `approved: true` field cannot bypass this step. The client must be trusted to present the form to the user rather than answer on the model's behalf; MCP elicitation itself is not an independent identity check. If the client cannot show forms, the tool returns `requires_terminal` and a command for the exact profile and state directory. Present that command for the user to review and run in a trusted terminal; do not execute it automatically as a workaround.

Approved changes persist per profile across sessions until revoked. They do not authorize a particular trade in the conversation, submit a transaction, or start a maintenance job. Inventory permission allows future maintenance transactions while a job is enabled, including previously enabled jobs when access is restored. Explain that continuing authority; then separately review and start the intended token target. Use `stop_inventory_maintenance` to disable replenishment and request `permissions: { inventory: false }` to revoke inventory access.

After `approved` or `unchanged`, inspect the saved policy and continue the authorized flow. After `declined`, `cancelled`, or an error, stop the dependent action; do not repeatedly prompt. A configuration change while approval is pending invalidates the proposal. Active transactions can block policy changes; inspect their status before requesting a fresh approval. A lost response is resolved with `get_config`, not an assumption that access was granted. Terminal `configure --deny-swaps`, `--deny-claims`, `--deny-bridges`, and `--deny-inventory` remain available for revocation.

Do not retry a transaction merely because permission was approved. Inspect any original operation first. If a quote expired before any operation was created, obtain a fresh quote within the user's bounds. For unattended callers, report missing access to the operator instead of opening an interactive approval loop; configure grants, total budgets, and stop conditions before launching the strategy. See the [MCP access examples](../../mcp/README.md#approve-execution-access).
