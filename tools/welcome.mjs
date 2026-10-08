export const banner = `███████╗██╗  ██╗██╗███████╗██╗     ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗
██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗
███████╗███████║██║█████╗  ██║     ██║  ██║    ███████╗██║ █╗ ██║███████║██████╔╝
╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║    ╚════██║██║███╗██║██╔══██║██╔═══╝
███████║██║  ██║██║███████╗███████╗██████╔╝    ███████║╚███╔███╔╝██║  ██║██║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝`;

/**
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
    tools: { available: ['✓', 'MCP connected'], preparing: ['○', 'Preparing'], not_checked: ['○', 'Not checked'] },
    account: { missing: ['○', 'Not configured'], locked: ['○', 'Unlock required'], configured: ['✓', 'Configured · access not checked'], usable: ['✓', 'Access verified'], unavailable: ['!', 'Access needs attention'], not_checked: ['○', 'Not checked'] },
    funding: { available: ['✓', 'Private funds found'], insufficient: ['○', 'Funding needed'], unavailable: ['!', 'Could not check'], not_checked: ['○', 'Not checked'] },
  };
  /** @param {string} title @param {string[] | undefined} state */
  const row = (title, state) => {
    const [mark, text] = state ?? ['○', 'Not checked'];
    return `│  ${mark} ${title.padEnd(14)}${text}`.padEnd(59) + '│';
  };
  return [width >= 82 ? banner : 'SHIELD SWAP', '', 'Private asset trading', '',
    '╭─ YOUR SETUP '.padEnd(59, '─') + '╮',
    row('Tools', labels.tools[tools]), row('Aleo account', labels.account[account]), row('Funding', labels.funding[funding]),
    '╰──────────────────────────────────────────────────────────╯', '',
    ...(['missing', 'locked', 'not_checked'].includes(account) ? ['GET STARTED', '  1. Configure an Aleo account for Shield Swap', '  2. Fund your account', ''] : []),
    'WHAT WOULD YOU LIKE TO DO?',
    '  Trade now              Complete a swap and receive your tokens.',
    '  Connect trading tools  Connect your existing terminal, bot, or app.',
    '  Build a strategy       Build and test a trading workflow.',
    '  Explore markets        Discover assets and get quotes.',
  ].join('\n');
}
