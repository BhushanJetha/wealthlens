// Protecting what you've built: is the life cover enough for the people who
// depend on you, what health cover there is, and which accounts, investments
// and policies have no nominee (hard for family to claim from India without).
import type { Holdings } from '../netWorth'
import type { PHolding } from './holdings'

const inr = (v: number, c: string, fx: number) => (c === 'AED' ? v * fx : v)

export interface Protection {
  incomeYear: number; dependents: number; loans: number; liquid: number
  cover: number; termCover: number; licCover: number; need: number; gap: number
  health: { amount: number; count: number }
}
// Life cover needed ≈ 10 years of income if anyone depends on you, plus loans,
// less what you could sell (not retirement money). All in ₹.
export function lifeCoverCheck(o: { h: Holdings; hs: PHolding[]; insurance: any[]; members: { relationship: string }[]; answers: Record<string, any> | null; income: { AED: number; INR: number }; fx: number }): Protection {
  const incomeYear = (o.income.AED * o.fx + o.income.INR) * 12
  const a = o.answers?.dependents
  const dependents = a != null ? (a === '0' ? 0 : a === '1-2' ? 2 : 3) : o.members.filter(m => !/self/i.test(m.relationship)).length
  const loans = (o.h.loans ?? []).reduce((s, l) => s + inr(Number(l.outstanding_amt) || 0, l.currency ?? 'INR', o.fx), 0)
  const liquid = o.hs.filter(x => x.investable && x.access !== 'locked').reduce((s, x) => s + inr(x.value, x.currency, o.fx), 0)
  const termCover = o.insurance.filter(p => p.policy_type === 'term_life').reduce((s, p) => s + inr(Number(p.sum_assured) || 0, p.currency, o.fx), 0)
  const licCover = (o.h.lic ?? []).reduce((s, l) => s + inr(Number(l.sum_assured) || 0, l.currency ?? 'INR', o.fx), 0)
  const cover = termCover + licCover
  const need = Math.max(0, (dependents > 0 ? incomeYear * 10 : 0) + loans - liquid)
  const healthPol = o.insurance.filter(p => p.policy_type === 'health')
  return { incomeYear, dependents, loans, liquid, cover, termCover, licCover, need, gap: Math.max(0, need - cover),
    health: { amount: healthPol.reduce((s, p) => s + inr(Number(p.sum_assured) || 0, p.currency, o.fx), 0), count: healthPol.length } }
}

// Everything that can carry a nominee. `ready` is false before migration 032
// (the column isn't there, so nothing can be marked yet).
export const NOMINEE_TABLES: { key: keyof Holdings | 'insurance'; table: string; label: string; name: (r: any) => string; only?: (r: any) => boolean }[] = [
  { key: 'accounts', table: 'accounts', label: 'Bank account', name: r => r.name, only: r => r.account_type !== 'credit_card' },
  { key: 'mutualFunds', table: 'mutual_funds', label: 'Mutual fund', name: r => r.fund_name },
  { key: 'stocks', table: 'stocks', label: 'Shares (demat)', name: r => r.name || r.symbol },
  { key: 'etf', table: 'etf_investments', label: 'ETF', name: r => r.etf_name || r.symbol },
  { key: 'fixedDeposits', table: 'fixed_deposits', label: 'Fixed deposit', name: r => r.name || r.bank_name },
  { key: 'recurringDeposits', table: 'recurring_deposits', label: 'Recurring deposit', name: r => r.name || r.bank_name },
  { key: 'ppfEpf', table: 'ppf_epf_accounts', label: 'PPF / EPF', name: r => r.name || String(r.kind).toUpperCase() },
  { key: 'nps', table: 'nps_accounts', label: 'NPS', name: r => r.name || 'NPS' },
  { key: 'gold', table: 'gold_investments', label: 'Gold', name: r => r.name },
  { key: 'bonds', table: 'bond_investments', label: 'Bond', name: r => r.name },
  { key: 'lic', table: 'lic_policies', label: 'LIC policy', name: r => r.name || r.plan_name },
  { key: 'otherAssets', table: 'other_assets', label: 'Asset', name: r => r.name },
  { key: 'insurance', table: 'insurance_policies', label: 'Insurance policy', name: r => r.policy_name },
]
export interface NomineeRow { table: string; id: string; name: string; label: string; nominee: string | null; currency: string }
export function nomineeRows(h: Holdings, insurance: any[]): { rows: NomineeRow[]; missing: number; ready: boolean } {
  const rows: NomineeRow[] = []
  let ready = false
  for (const t of NOMINEE_TABLES) {
    const list = (t.key === 'insurance' ? insurance : (h[t.key as keyof Holdings] as any[]) ?? []).filter(r => r && typeof r === 'object' && (!t.only || t.only(r)) && r.is_active !== false)
    for (const r of list) {
      if ('nominee' in r) ready = true
      rows.push({ table: t.table, id: r.id, name: t.name(r) || t.label, label: t.label, nominee: r.nominee ?? null, currency: r.currency ?? 'INR' })
    }
  }
  return { rows, missing: rows.filter(r => !r.nominee).length, ready }
}
