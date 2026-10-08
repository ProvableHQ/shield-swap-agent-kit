/** Operation fixtures. Each one names the pages to read, where to stop, and what must not happen. */
export const operationScenarios = [
  {
    name: 'timed-out submission',
    read: [
      'context/shield-swap-setup/error-handling.md',
      'context/shield-swap-setup/recover-swaps.md',
      'context/safety/unattended-trading.md',
    ],
    stop: [
      'inspect whether submission happened',
      'A timed-out submission remains in flight until its outcome is resolved',
    ],
    mustNot: [
      'Wrap the whole swap in an automatic retry',
      'create a new swap to recover the old one',
    ],
  },
  {
    name: 'restart before claim',
    read: [
      'context/safety/unattended-trading.md',
      'context/decisions/trade/bot-integration.md',
      'context/shield-swap-setup/recover-swaps.md',
    ],
    stop: [
      'recover in-flight work before admitting new writes',
      'the same signal still corresponds to one operation after restart',
    ],
    mustNot: [
      'launch a replacement swap',
    ],
  },
  {
    name: 'duplicate signal',
    read: [
      'context/decisions/trade/bot-integration.md',
      'context/safety/unattended-trading.md',
    ],
    stop: [
      'A completed duplicate returns the existing result',
      'Return the original operation for duplicate signals',
    ],
    mustNot: [
      'must not place another trade',
      'rather than launching another swap',
    ],
  },
  {
    name: 'refund or partial fill',
    read: [
      'context/shield-swap-setup/swap.md',
      'context/shield-swap-setup/swap-history.md',
      'context/decisions/trade/bot-integration.md',
    ],
    stop: [
      'Report it as such without placing a replacement trade automatically',
      'A partial fill and an all-input refund need distinct reporting',
      'A refund or partial fill is the outcome of that operation',
    ],
    mustNot: [
      'without placing a replacement trade automatically',
    ],
  },
]
