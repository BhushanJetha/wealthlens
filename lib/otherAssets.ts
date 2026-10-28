// Everything you own that has no page of its own (migration 032, other_assets):
// property and land, vehicles, jewellery, a business, and investments held
// outside India's usual types — US stocks, a UAE broker, ESOPs / RSUs,
// crypto. Plus UAE end-of-service gratuity, which grows with every month
// worked. Values are your own estimates (labelled so) unless units × a price.

export type OtherKind = 'property' | 'land' | 'vehicle' | 'jewellery' | 'business' | 'us_stocks' | 'uae_broker' | 'esop' | 'crypto' | 'other'
// Net-worth group each kind joins (lib/netWorth ASSET_GROUPS)
export type OtherGroup = 'property' | 'equity' | 'gold' | 'other'
export const OTHER_KINDS: { key: OtherKind; label: string; icon: string; group: OtherGroup; priced: boolean; hint: string }[] = [
  { key: 'property',   label: 'Home / flat',        icon: '🏠', group: 'property', priced: false, hint: 'What it would sell for today' },
  { key: 'land',       label: 'Land / plot',        icon: '🌳', group: 'property', priced: false, hint: 'Recent prices of nearby plots' },
  { key: 'vehicle',    label: 'Car / bike',         icon: '🚗', group: 'other',    priced: false, hint: 'Resale value — it drops each year' },
  { key: 'jewellery',  label: 'Gold jewellery',     icon: '💍', group: 'gold',     priced: false, hint: 'Gold weight × today’s rate (not the making charges)' },
  { key: 'business',   label: 'Business share',     icon: '💼', group: 'other',    priced: false, hint: 'Your share of what it’s worth' },
  { key: 'us_stocks',  label: 'US / global stocks', icon: '🌎', group: 'equity',   priced: true,  hint: 'e.g. through Interactive Brokers, Stake, Vested' },
  { key: 'uae_broker', label: 'UAE investments',    icon: '🇦🇪', group: 'equity',   priced: true,  hint: 'e.g. Sarwa, ADX / DFM shares, a UAE fund' },
  { key: 'esop',       label: 'ESOP / RSU',         icon: '🎫', group: 'equity',   priced: true,  hint: 'Vested units count; unvested are shown, not counted' },
  { key: 'crypto',     label: 'Crypto',             icon: '🪙', group: 'other',    priced: true,  hint: 'Units × today’s price' },
  { key: 'other',      label: 'Something else',     icon: '📦', group: 'other',    priced: false, hint: 'Art, a loan you gave, a deposit…' },
]
export const otherKind = (k: string) => OTHER_KINDS.find(x => x.key === k) ?? OTHER_KINDS[OTHER_KINDS.length - 1]

export const USD_AED = 3.6725   // the dirham's fixed peg to the dollar
const yearsBetween = (a: string, b: string) => Math.max(0, (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / (365.25 * 864e5))

// Value today and cost, in AED or INR (US dollars count as dirhams at the peg).
// An estimate grows by its own expected yearly rise from the date it was set.
export function otherAssetValue(a: any, today: string): { value: number; cost: number; currency: 'AED' | 'INR'; estimated: boolean } {
  const usd = a.currency === 'USD', rate = usd ? USD_AED : 1
  const currency: 'AED' | 'INR' = a.currency === 'INR' ? 'INR' : 'AED'
  const priced = Number(a.units) > 0 && Number(a.price) > 0
  let value = priced ? Number(a.units) * Number(a.price) : Number(a.current_value) || 0
  const g = Number(a.growth_pct)
  if (!priced && g && a.value_as_of) value *= Math.pow(1 + g / 100, yearsBetween(a.value_as_of, today))
  // No purchase price → no gain is claimed (cost = value)
  const cost = Number(a.purchase_price) > 0 ? Number(a.purchase_price) : value
  return { value: Math.max(0, value) * rate, cost: Math.max(0, cost) * rate, currency, estimated: !priced }
}

// ── UAE gratuity (end of service) ────────────────────────────────────────────
// 21 days' basic a year for the first 5 years, 30 days after; nothing under a
// year; at most 2 years' basic. Same rule as the NRI toolkit.
export interface Gratuity { basic: number; joined: string; include?: boolean }
export function gratuityValue(g: Gratuity | null | undefined, today: string): number {
  if (!g || !(Number(g.basic) > 0) || !g.joined) return 0
  const b = Number(g.basic), years = yearsBetween(g.joined, today), daily = b / 30
  if (years < 1) return 0
  return Math.min(Math.min(years, 5) * 21 * daily + Math.max(years - 5, 0) * 30 * daily, b * 24)
}
