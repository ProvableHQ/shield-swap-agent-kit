export const banner = `███████╗██╗  ██╗██╗███████╗██╗     ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗
██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗
███████╗███████║██║█████╗  ██║     ██║  ██║    ███████╗██║ █╗ ██║███████║██████╔╝
╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║    ╚════██║██║███╗██║██╔══██║██╔═══╝
███████║██║  ██║██║███████╗███████╗██████╔╝    ███████║╚███╔███╔╝██║  ██║██║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝`;

/**
 * Render Markdown with a fenced banner/setup box and bold menu titles.
 * Render public readiness only. Never interpolate profile paths, keys, balances,
 * backend messages or historical account notes into the welcome.
 * @param {{checks?: {tools?: {status: string}, account?: {status: string}, funding?: {status: string}}}} report
 * @param {{width?: number}} options
 */
export function renderWelcome(report = {}, { width = 100 } = {}) {
  const account = report.checks?.account?.status ?? 'not_checked';
  const funding = report.checks?.funding?.status ?? 'not_checked';
  const tools = report.checks?.tools?.status ?? 'not_checked';
  const labels = {
    tools: { available: ['✓', 'Available'], preparing: ['○', 'Preparing'], not_checked: ['○', 'Not checked'] },
    account: { missing: ['○', 'Not configured'], locked: ['○', 'Unlock required'], configured: ['✓', 'Configured · access not checked'], usable: ['✓', 'Access verified'], unavailable: ['!', 'Access needs attention'], not_checked: ['○', 'Not checked'] },
    funding: { available: ['✓', 'Private funds found'], insufficient: ['○', 'Funding needed'], unavailable: ['!', 'Could not check'], not_checked: ['○', 'Not checked'] },
  };
  /** @param {string} title @param {string[] | undefined} state */
  const row = (title, state) => {
    const [mark, text] = state ?? ['○', 'Not checked'];
    return `│  ${mark} ${title.padEnd(14)}${text}`.padEnd(59) + '│';
  };
  return ['```text', width >= 82 ? banner : 'SHIELD SWAP', '', 'Private asset trading', '',
    '╭─ YOUR SETUP '.padEnd(59, '─') + '╮',
    row('Tools', labels.tools[tools]), row('Aleo account', labels.account[account]), row('Funding', labels.funding[funding]),
    '╰──────────────────────────────────────────────────────────╯', '```', '',
    '**GET STARTED**', '',
    '1. **Configure an Aleo account for Shield Swap**\\',
    '   Setup an Aleo account to trade privately on Shield Swap.', '',
    '2. **Fund an account**\\',
    '   Bridge assets from Ethereum or Solana privately to Aleo', '',
    '3. **Explore markets**\\',
    '   Explore market opportunities on Shield Swap', '',
    '4. **Setup a private trading integration**\\',
    '   Integrate trading on Shield Swap into your application', '',
    '**STRATEGIES**', '',
    '5. **Create an arbitrage bot**', '',
    '**INTEGRATIONS [Coming Soon]**', '',
    '6. **Hummingbot:** Add a privacy layer to hummingbot.',
    '7. **Hyperliquid:** Trade perpetual futures privately on Hyperliquid.',
    '8. **Prediction Markets:** Create a private vault around prediction market trades.',
  ].join('\n');
}
