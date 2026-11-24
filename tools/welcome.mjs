export const banner = `███████╗██╗  ██╗██╗███████╗██╗     ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗
██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗
███████╗███████║██║█████╗  ██║     ██║  ██║    ███████╗██║ █╗ ██║███████║██████╔╝
╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║    ╚════██║██║███╗██║██╔══██║██╔═══╝
███████║██║  ██║██║███████╗███████╗██████╔╝    ███████║╚███╔███╔╝██║  ██║██║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝`;

/**
 * Render Markdown with a fenced banner/setup box and bold menu titles.
 * Keep detailed account and tool reports behind the explicit check commands.
 * Never interpolate key material, raw errors, or historical funding notes.
 * @param {object} report
 * @param {{width?: number}} options
 */
export function renderWelcome(report = {}, { width = 100 } = {}) {
  const account = report.checks?.account?.status ?? 'not_checked';
  const funding = report.checks?.funding?.status ?? 'not_checked';
  const tools = report.checks?.tools?.status ?? 'not_checked';
  const labels = {
    tools: { available: ['✓', report.tools ? `${report.tools.length} installations found` : 'Available'], missing: ['○', 'No tools found'], preparing: ['○', 'Preparing'], not_checked: ['○', 'Not checked'] },
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
    '**CHECK SETUP**', '',
    '5. **Check existing accounts**\\',
    '   List your Aleo, EVM, and Solana accounts, addresses, and access status.', '',
    '6. **Check existing setup**\\',
    '   Check your project, installed tools, versions, locations, and connections.', '',
    '**STRATEGIES**', '',
    '7. **Create an arbitrage bot**', '',
    '**INTEGRATIONS [Coming Soon]**', '',
    '8. **Hummingbot:** Add a privacy layer to hummingbot.',
    '9. **Hyperliquid:** Trade perpetual futures privately on Hyperliquid.',
    '10. **Prediction Markets:** Create a private vault around prediction market trades.', '',
    'You can also type `check accounts` or `check setup`.',
  ].join('\n');
}

// Inventory labels come from public metadata. Escape formatting and ignore all
// fields outside this presentation contract, including errors and credentials.
function text(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/APrivateKey1\S+|AViewKey1\S+|0x[0-9a-fA-F]{64}\b/g, '[redacted]')
    .replace(/[\\`*_{}\[\]<>|]/g, '\\$&').slice(0, 512);
}
function shortAddress(address) {
  if (!/^(aleo1[023456789acdefghjklmnpqrstuvwxyz]{58}|0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(address ?? '')) return '';
  return `${address.slice(0, address.startsWith('aleo') ? 10 : 6)}…${address.slice(-6)}`;
}
function location(value) {
  if (/^https?:\/\//i.test(value ?? '')) {
    try {
      const url = new URL(value);
      url.username = ''; url.password = ''; url.search = ''; url.hash = '';
      return text(url.toString());
    } catch { return 'Location not reported'; }
  }
  return text(value);
}

export function renderAccounts(report, { fullAddresses = false, showLocations = false } = {}) {
  const lines = ['**ACCOUNTS**', ''];
  const storage = { keychain: 'Keychain', encrypted: 'Encrypted file', plaintext: 'Unencrypted file',
    none: 'Address only', 'os-keyring': 'OS credential store' };
  const statuses = { saved: 'Access not checked', metadata_unavailable: 'Account file found; details unavailable',
    key_file_found: 'Keypair file found; address and access not checked', address_only: 'Address known; access not checked',
    locked: 'Unlock required', usable: 'Access verified', unavailable: 'Access needs attention' };
  for (const [family, label] of [['aleo', 'Aleo'], ['evm', 'EVM'], ['solana', 'Solana']]) {
    const matching = (report.accounts ?? []).filter(item => item.family === family);
    const grouped = new Map();
    for (const account of matching) {
      const key = account.address ? (family === 'evm' ? account.address.toLowerCase() : account.address) : account.path ?? account.name;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(account);
    }
    for (const group of grouped.values()) {
      const account = group.find(item => item.status === 'saved') ?? group[0];
      const names = [...new Set(group.map(item => text(item.name)))].join(', ');
      const short = shortAddress(account.address);
      const address = short && fullAddresses ? text(account.address) : short;
      const protection = [...new Set(group.map(item => storage[item.storage]).filter(Boolean))].join(', ');
      const states = new Set(group.map(item => statuses[item.status] ?? 'Not checked'));
      const access = states.size === 1 ? [...states][0]
        : group.map(item => `${text(item.name)}: ${statuses[item.status] ?? 'Not checked'}`).join('; ');
      lines.push(`- **${label} · ${names}**${address ? ` · ${address}` : ''}\\`,
        `  ${protection ? `${protection} · ` : ''}${access}`);
      if (showLocations) for (const item of group) {
        if (item.path) {
          lines[lines.length - 1] += '\\';
          lines.push(`  Location (${text(item.name)}): ${text(item.path)}`);
        }
      }
    }
    const sources = (report.sources ?? []).filter(item => item.family === family);
    for (const source of sources) lines.push(`- **${label} · ${text(source.name)}** · ${source.status === 'empty'
      ? 'Configured but empty' : 'Key source configured; address and access not checked'}`);
    if (!matching.length && !sources.length) {
      const failed = (report.issues ?? []).some(item => item.family === family || item.family === 'source_wallets');
      lines.push(`- **${label}** · ${failed ? 'Could not check all account locations' : report.accounts ? 'None found in checked locations' : 'Not checked'}`);
    } else if ((report.issues ?? []).some(item => item.family === family || item.family === 'source_wallets')) {
      lines.push(`  Some ${label} account locations could not be checked.`);
    }
  }
  return lines;
}

export function renderTools(report) {
  const lines = ['**TOOLS**', ''];
  for (const tool of report.tools ?? []) {
    lines.push(`- **${text(tool.name)}** · ${tool.version ? text(tool.version) : 'Version unavailable'}\\`,
      `  ${text(tool.path)}${tool.environment && tool.environment !== report.project ? ` (${text(tool.environment)})` : ''}`);
  }
  if (!report.tools?.length) lines.push(report.tools ? 'No supported local tools found.' : 'Local tools not checked.');
  for (const connection of report.connections ?? []) {
    const state = { ready: 'Connected', locked: 'Unlock required', setup_required: 'Connection setup required',
      unavailable: 'Unavailable' }[connection.status] ?? 'Not checked';
    lines.push(`- **${text(connection.name)}** · ${state} · ${connection.version ? text(connection.version) : 'Version not reported'}\\`,
      `  ${connection.location ? location(connection.location) : 'Agent tool connection; location not reported'}`);
  }
  if (report.issues?.some(item => item.family === 'tools')) lines.push('Some tool versions could not be checked.');
  return lines;
}

export function renderInventory(report, options) {
  return [...renderAccounts(report, options), '', ...renderTools(report), '', '---', ''];
}

/** Targeted command results omit the onboarding banner and journey menu. */
export function renderInspection(report, command) {
  const options = { fullAddresses: true, showLocations: true };
  if (command === 'accounts') return renderAccounts(report, options).join('\n');
  return ['**EXISTING SETUP**', '', `Project: ${text(report.project)}`, '',
    ...renderAccounts(report, options), '', ...renderTools(report)].join('\n');
}
