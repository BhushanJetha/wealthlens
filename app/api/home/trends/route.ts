import { NextResponse } from 'next/server'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getAedInr } from '@/lib/fx'
import { prepareMoney } from '@/lib/money'
import { buildTrends, monthsUpTo } from '@/lib/homeTrends'

// Home's trends for the last `months` months (lib/homeTrends): read in one go,
// then counted the same way as every other screen. Up to five years.
export async function GET(req: Request) {
  const sb = createClient()
  const user = await getSessionUser(sb)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = user.id
  const n = Math.min(60, Math.max(2, Number(new URL(req.url).searchParams.get('months')) || 25))
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const months = monthsUpTo(today.slice(0, 7), n), from = `${months[0]}-01`

  const opt = (q: any) => q.then((r: any) => r.data ?? [], () => [])
  const [txns, accounts, cats, stocks, mfs, etf, fds, rds, nps, lic, ppf, gold, bonds, invTxns, loans, loanTxns, snaps, fx] = await Promise.all([
    fetchAllRows((a, b) => sb.from('transactions').select('*').eq('user_id', uid).gte('txn_date', from).order('txn_date').order('id').range(a, b), 60),
    opt(sb.from('accounts').select('id,account_type').eq('user_id', uid)),
    opt(sb.from('categories').select('*').eq('user_id', uid)),
    // The same holdings the Investments page counts (lib/investFlows)
    opt(sb.from('stocks').select('*').eq('user_id', uid)),
    opt(sb.from('mutual_funds').select('*').eq('user_id', uid)),
    opt(sb.from('etf_investments').select('*').eq('user_id', uid)),
    opt(sb.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true)),
    opt(sb.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true)),
    opt(sb.from('nps_accounts').select('*').eq('user_id', uid)),
    opt(sb.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true)),
    opt(sb.from('ppf_epf_accounts').select('*').eq('user_id', uid)),
    opt(sb.from('gold_investments').select('*').eq('user_id', uid)),
    opt(sb.from('bond_investments').select('*').eq('user_id', uid)),
    fetchAllRows((a, b) => sb.from('investment_transactions').select('asset_type,asset_id,txn_date,txn_type,amount').eq('user_id', uid).order('txn_date').order('id').range(a, b), 30),
    // Loans (the active ones count, as on the Loans page)
    opt(sb.from('home_loans').select('*').eq('user_id', uid)),
    opt(sb.from('loan_transactions').select('loan_id,kind,txn_date,amount,principal,interest').eq('user_id', uid)),
    fetchAllRows((a, b) => sb.from('net_worth_snapshots').select('snap_date,fx,uae_assets,uae_liab,india_assets,india_liab,breakdown').eq('user_id', uid).gte('snap_date', from).order('snap_date').range(a, b), 5),
    getAedInr().then(r => r.rate),
  ])

  const cardIds = new Set<string>(accounts.filter((a: any) => a.account_type === 'credit_card').map((a: any) => a.id))
  const trends = buildTrends({
    months, today, fx, rows: cats, loans, loanTxns, snapshots: snaps,
    prepared: prepareMoney(txns, { fx, cardIds }),
    holdings: { stocks, mutualFunds: mfs, etf, fixedDeposits: fds, recurringDeposits: rds, nps, lic, ppfEpf: ppf, gold, bonds, invTxns },
  })
  return NextResponse.json(trends, { headers: { 'Cache-Control': 'no-store' } })
}
