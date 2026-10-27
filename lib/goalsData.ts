// Everything the Goals pages need, loaded once on the server: goals and what
// funds them (linked investments, money added by hand, accounts with live
// balances), plus 14 months of transactions for your monthly saving, travel
// spend, extra income and last Diwali's spending, and insurance policies (for
// premium goals). Tables from later migrations come back empty.
import { fetchAllRows } from './supabase/fetchAll'
import { activeAccountsWithLedger } from './ledger'
import { activeLoansWithEmi } from './loans'
import { getAedInr } from './fx'
import { isMissingTable } from './supabase/missingTable'

export const INVESTMENT_TABLES = ['stocks', 'mutual_funds', 'fixed_deposits', 'recurring_deposits', 'nps_accounts', 'lic_policies', 'gold_investments', 'bond_investments', 'etf_investments'] as const

export async function loadGoalsData(supabase: any, uid: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 14)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  const recent = new Date(); recent.setUTCMonth(recent.getUTCMonth() - 4)
  const { rate: fx } = await getAedInr()

  const inv = INVESTMENT_TABLES.map(t => {
    let q = supabase.from(t).select('*').eq('user_id', uid)
    if (['fixed_deposits', 'recurring_deposits', 'lic_policies'].includes(t)) q = q.eq('is_active', true)
    return q
  })
  const [goalsRes, linksRes, contribRes, invTxnRes, accRes, loansRes, famRes, insRes, txns, ...invRes] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('goal_investments').select('*').eq('user_id', uid),
    supabase.from('goal_contributions').select('*').eq('user_id', uid).order('contrib_date', { ascending: false }),
    supabase.from('investment_transactions').select('asset_id,txn_type,txn_date,amount').eq('user_id', uid).gte('txn_date', `${recent.toISOString().slice(0, 7)}-01`),
    activeAccountsWithLedger(supabase, uid, fx),
    activeLoansWithEmi(supabase, uid),
    supabase.from('family_members').select('id,name,relationship').eq('user_id', uid).eq('is_active', true).order('created_at'),
    supabase.from('insurance_policies').select('id,policy_name,provider,annual_premium,premium_frequency,start_date,expiry_date,next_premium_date,currency').eq('user_id', uid).eq('is_active', true),
    fetchAllRows((a: number, b: number) => supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    ...inv,
  ])
  const investments = Object.fromEntries(INVESTMENT_TABLES.map((t, i) => [t, invRes[i].data ?? []])) as Record<string, any[]>
  return {
    today, fx,
    goals: (goalsRes.data ?? []) as any[],
    links: (linksRes.data ?? []) as any[],
    contributions: (contribRes.data ?? []) as any[],
    contributionsReady: !isMissingTable(contribRes.error),
    invTxns: (invTxnRes.data ?? []) as any[],
    accounts: (accRes.data ?? []) as any[],
    loans: (loansRes.data ?? []) as any[],
    members: (famRes.data ?? []) as { name: string; relationship: string }[],
    insurance: (insRes.data ?? []) as any[],
    transactions: txns as any[],
    investments,
  }
}
export type GoalsData = Awaited<ReturnType<typeof loadGoalsData>>
