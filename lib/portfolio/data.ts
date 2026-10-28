// Everything the Wealth overview and the portfolio manager need, loaded once
// on the server: every holding (with live bank balances, property, other
// assets and gratuity), loans, policies, goals and their links, family, the
// investor profile, monthly averages per currency and the latest reviews.
// Tables from later migrations come back empty.
import { fetchAllRows } from '../supabase/fetchAll'
import { activeAccountsWithLedger } from '../ledger'
import { activeLoansWithEmi } from '../loans'
import { getAedInr } from '../fx'
import { isMissingTable } from '../supabase/missingTable'
import { loadWealthExtras } from '../wealthExtras'
import { monthlyAverages } from '../goalsView'
import type { Holdings } from '../netWorth'

export async function loadPortfolioData(supabase: any, uid: string, opts: { txMonths?: number } = {}) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - (opts.txMonths ?? 4))
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  const { rate: fx } = await getAedInr()
  const sel = (t: string) => supabase.from(t).select('*').eq('user_id', uid)
  const [accounts, stocks, mf, etf, nps, fd, rd, ppf, gold, bonds, lic, loans, insurance, goals, links, members, reviews, txns, extras] = await Promise.all([
    activeAccountsWithLedger(supabase, uid, fx), sel('stocks'), sel('mutual_funds'), sel('etf_investments'), sel('nps_accounts'),
    sel('fixed_deposits').eq('is_active', true), sel('recurring_deposits').eq('is_active', true), sel('ppf_epf_accounts'),
    sel('gold_investments'), sel('bond_investments'), sel('lic_policies').eq('is_active', true), activeLoansWithEmi(supabase, uid),
    sel('insurance_policies').eq('is_active', true), supabase.from('goals').select('id,name,status,currency,target_amount,target_date,repeat_months').eq('user_id', uid),
    supabase.from('goal_investments').select('goal_id,investment_type,investment_id,allocation_pct').eq('user_id', uid),
    supabase.from('family_members').select('name,relationship').eq('user_id', uid).eq('is_active', true),
    supabase.from('portfolio_reviews').select('id,kind,label,period_start,period_end,created_at,seen_at,data').eq('user_id', uid).order('period_end', { ascending: false }).order('created_at', { ascending: false }).limit(12),
    fetchAllRows((a: number, b: number) => supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', fromDate).order('txn_date', { ascending: false }).order('id').range(a, b)),
    loadWealthExtras(supabase, uid),
  ])
  // A failed read would silently count as zero — the pages say so instead
  // (tables from migrations not run yet aren't failures)
  const named: [string, any][] = [['Bank accounts', accounts], ['Stocks', stocks], ['Mutual funds', mf], ['ETFs', etf], ['NPS', nps], ['Fixed deposits', fd],
    ['Recurring deposits', rd], ['PPF / EPF', ppf], ['Gold', gold], ['Bonds', bonds], ['LIC', lic], ['Loans', loans], ['Insurance', insurance]]
  const failed = named.filter(([, r]) => r.error && !isMissingTable(r.error)).map(([n]) => n)
  const holdings: Holdings = {
    accounts: accounts.data ?? [], stocks: stocks.data ?? [], mutualFunds: mf.data ?? [], etf: etf.data ?? [], nps: nps.data ?? [],
    fixedDeposits: fd.data ?? [], recurringDeposits: rd.data ?? [], ppfEpf: ppf.data ?? [], gold: gold.data ?? [], bonds: bonds.data ?? [],
    lic: lic.data ?? [], loans: loans.data ?? [], otherAssets: extras.otherAssets, gratuity: extras.gratuity, today,
  }
  return {
    today, fx, holdings, transactions: txns as any[], failed,
    insurance: (insurance.data ?? []) as any[],
    goals: (goals.data ?? []) as any[], links: (links.data ?? []) as any[],
    members: (members.data ?? []) as { name: string; relationship: string }[],
    profile: extras.profile, wealthReady: extras.ready,
    reviews: (reviews.data ?? []) as any[], reviewsReady: !isMissingTable(reviews.error) && !reviews.error,
    monthly: monthlyAverages(txns as any[], fx, today),
  }
}
export type PortfolioData = Awaited<ReturnType<typeof loadPortfolioData>>
