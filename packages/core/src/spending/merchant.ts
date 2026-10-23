export type Merchant = { name: string; aliases: string[]; category: string };

const m = (name: string, category: string, ...aliases: string[]): Merchant => ({
  name,
  aliases,
  category,
});

export const MERCHANTS: readonly Merchant[] = [
  m('Woolworths', 'Groceries', 'WOOLWORTHS', 'WW METRO'),
  m('Coles', 'Groceries', 'COLES'),
  m('Aldi', 'Groceries', 'ALDI'),
  m('IGA', 'Groceries', 'IGA'),
  m('Bunnings', 'Home', 'BUNNINGS'),
  m('Kmart', 'Shopping', 'KMART'),
  m('Target', 'Shopping', 'TARGET'),
  m('JB Hi-Fi', 'Shopping', 'JB HI FI', 'JB HI-FI'),
  m('Amazon', 'Shopping', 'AMAZON', 'AMZN'),
  m('Chemist Warehouse', 'Health', 'CHEMIST WAREHOUSE', 'CHEMISTWAREHOUSE'),
  m('Priceline', 'Health', 'PRICELINE'),
  m('Opal', 'Transport', 'OPAL', 'TRANSPORTFORNSW'),
  m('Uber', 'Transport', 'UBER TRIP', 'UBER *TRIP'),
  m('Ampol', 'Transport', 'AMPOL'),
  m('BP', 'Transport', 'BP '),
  m('7-Eleven', 'Transport', '7-ELEVEN', '7 ELEVEN'),
  m('Shell', 'Transport', 'SHELL '),
  m('Linkt', 'Transport', 'LINKT'),
  m('Uber Eats', 'Dining out', 'UBER EATS', 'UBER *EATS'),
  m('Menulog', 'Dining out', 'MENULOG'),
  m('DoorDash', 'Dining out', 'DOORDASH'),
  m("McDonald's", 'Dining out', 'MCDONALDS'),
  m('AGL', 'Bills & utilities', 'AGL'),
  m('Origin', 'Bills & utilities', 'ORIGIN ENERGY'),
  m('EnergyAustralia', 'Bills & utilities', 'ENERGYAUSTRALIA'),
  m('Telstra', 'Bills & utilities', 'TELSTRA'),
  m('Optus', 'Bills & utilities', 'OPTUS'),
  m('Aussie Broadband', 'Bills & utilities', 'AUSSIE BROADBAND'),
  m('Sydney Water', 'Bills & utilities', 'SYDNEY WATER'),
  m('Netflix', 'Subscriptions', 'NETFLIX'),
  m('Spotify', 'Subscriptions', 'SPOTIFY'),
  m('Disney Plus', 'Subscriptions', 'DISNEY PLUS', 'DISNEYPLUS'),
  m('Stan', 'Subscriptions', 'STAN.COM'),
  m('YouTube Premium', 'Subscriptions', 'YOUTUBE PREMIUM', 'GOOGLE YOUTUBE'),
  m('Apple', 'Subscriptions', 'APPLE.COM/BILL'),
  m('Medibank', 'Insurance', 'MEDIBANK'),
  m('Bupa', 'Insurance', 'BUPA'),
  m('NRMA', 'Insurance', 'NRMA INSURANCE'),
  m('ATO', 'Government & tax', 'ATO', 'AUSTRALIAN TAXATION'),
];

// Flattened (alias, merchant), longest alias first so "UBER EATS" beats "UBER TRIP"/"UBER".
const ALIASES = MERCHANTS.flatMap((x) => x.aliases.map((alias) => ({ alias, merchant: x }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

const PREFIXES = ['SQ *', 'SMP*', 'PAYPAL *', 'ZLR*', 'LS ', 'EFTPOS ', 'VISA DEBIT PURCHASE '];

function findByAlias(upper: string): Merchant | null {
  // Trailing space lets aliases like "BP " match a bare "BP".
  const padded = upper + ' ';
  for (const { alias, merchant } of ALIASES) {
    if (!padded.startsWith(alias)) continue;
    // Aliases ending in a letter/digit must end at a word boundary ("ATO" must not match "ATOMIC").
    const next = padded.charAt(alias.length);
    if (/[A-Z0-9]$/.test(alias) && /[A-Z0-9]/.test(next)) continue;
    return merchant;
  }
  return null;
}

export function cleanMerchant(raw: string): string {
  let s = raw.trim();
  const up = s.toUpperCase();
  const prefix = PREFIXES.find((p) => up.startsWith(p));
  if (prefix) s = s.slice(prefix.length);
  s = s
    .replace(/Card xx\d+/gi, ' ')
    .replace(/Value Date:.*$/i, ' ')
    .replace(/\d{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+AUS?$/i, '')
    .replace(/\s+(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  const hit = findByAlias(s.toUpperCase());
  if (hit) return hit.name;
  return s
    .split(' ')
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function merchantCategory(merchant: string): string | null {
  const up = merchant.trim().toUpperCase();
  const byName = MERCHANTS.find((x) => x.name.toUpperCase() === up);
  if (byName) return byName.category;
  return findByAlias(up)?.category ?? null;
}
