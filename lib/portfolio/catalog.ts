// Named examples for "what to add" — well-known, low-cost, widely held
// products to research, not recommendations. No single-company shares (the
// user chose that). Costs and NRI eligibility change: every example says so.
import type { Cls } from './holdings'

export interface Example { name: string; kind: string; where: string; note: string }
export const EXAMPLE_NOTE = 'Examples to research, not recommendations — check the current expense ratio, and that it accepts NRI investors from the UAE.'

export const EXAMPLES: Record<string, Example[]> = {
  // India — equity
  india_index: [
    { name: 'UTI Nifty 50 Index Fund (Direct)', kind: 'Index fund', where: 'India', note: 'India’s 50 biggest companies, very low cost' },
    { name: 'HDFC Index Fund – Nifty 50 Plan (Direct)', kind: 'Index fund', where: 'India', note: 'Same index, another large fund house' },
    { name: 'Nippon India ETF Nifty 50 BeES', kind: 'ETF', where: 'India (needs a demat account)', note: 'Buy on the exchange like a share' },
  ],
  india_flexi: [
    { name: 'Parag Parikh Flexi Cap Fund (Direct)', kind: 'Flexi-cap fund', where: 'India', note: 'Actively managed; holds some global shares too' },
  ],
  india_mid: [
    { name: 'Motilal Oswal Nifty Midcap 150 Index Fund (Direct)', kind: 'Index fund', where: 'India', note: 'Mid-size companies — more growth, bigger swings' },
  ],
  // Global — from the UAE, Ireland-listed (UCITS) ETFs suit non-US investors
  global: [
    { name: 'Vanguard FTSE All-World UCITS ETF (VWRA)', kind: 'Global ETF', where: 'UAE broker (e.g. Interactive Brokers, Sarwa)', note: 'Thousands of companies worldwide in one fund' },
    { name: 'iShares Core MSCI World UCITS ETF (SWDA)', kind: 'Global ETF', where: 'UAE broker', note: 'Developed markets' },
    { name: 'iShares Core S&P 500 UCITS ETF (CSPX)', kind: 'US ETF', where: 'UAE broker', note: 'The 500 largest US companies' },
  ],
  // Debt
  nre_fd: [
    { name: 'NRE fixed deposit', kind: 'Bank FD', where: 'Your Indian bank (NRE account)', note: 'Interest is tax-free in India and fully repatriable' },
  ],
  india_debt: [
    { name: 'Bharat Bond ETF (target maturity)', kind: 'Debt ETF', where: 'India', note: 'Government-company bonds that mature on a set date' },
    { name: 'A short-duration or corporate-bond fund (Direct) from a large fund house', kind: 'Debt fund', where: 'India', note: 'Steadier than equity; gains are taxed at your slab rate' },
  ],
  uae_cash: [
    { name: 'High-interest savings or a short fixed deposit with your UAE bank', kind: 'Bank', where: 'UAE', note: 'Quick to reach for emergencies' },
    { name: 'A money-market fund on your broker', kind: 'Money-market fund', where: 'UAE broker', note: 'Near-cash, usually pays more than a current account' },
  ],
  // Gold
  gold: [
    { name: 'Nippon India ETF Gold BeES', kind: 'Gold ETF', where: 'India (demat)', note: 'Tracks the gold price, no making charges or storage' },
    { name: 'SBI Gold Fund / HDFC Gold ETF Fund of Fund (Direct)', kind: 'Gold fund', where: 'India', note: 'Same idea without a demat account' },
    { name: 'Investment-grade gold bars or coins', kind: 'Physical gold', where: 'UAE', note: 'Not jewellery — no making charges' },
  ],
  // Tax saving (old regime, taxable Indian income)
  elss: [
    { name: 'An ELSS (tax-saver) fund, Direct plan', kind: 'ELSS', where: 'India', note: 'Counts for section 80C under the old tax regime; locked 3 years' },
  ],
}

// Which example groups fit a gap in a class, given the answers
export function examplesFor(cls: Cls, a: { return?: string; avoid?: string[]; profile?: string }): string[] {
  const noGlobal = a.avoid?.includes('global'), staying = a.return === 'no' || a.return === 'later'
  if (cls === 'equity') return [
    'india_index',
    ...(a.profile === 'growth' || a.profile === 'aggressive' ? ['india_mid'] : []),
    'india_flexi',
    ...(!noGlobal && (staying || a.return == null) ? ['global'] : []),
  ]
  if (cls === 'debt') return a.return === 'india' ? ['india_debt'] : ['nre_fd', 'india_debt']
  if (cls === 'gold') return a.avoid?.includes('gold') ? [] : ['gold']
  return ['uae_cash']
}
