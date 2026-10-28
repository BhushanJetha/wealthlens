import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { withLedgerBalances } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import DashboardClient from '@/components/dashboard/DashboardClient'
import { computeNetWorth, groupAssets, NW_RULES, type Holdings } from '@/lib/netWorth'
import { getAedInr } from '@/lib/fx'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { goalInterestsOf } from '@/lib/goalInterests'
import { runAutomation } from '@/lib/automation'
import { loadWealthExtras } from '@/lib/wealthExtras'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  // Snapshot dates follow UAE time (the app's home market), so a late-night
  // visit doesn't land on the previous UTC day.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  const histFrom = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)

  // Repeating entries, EMIs and SIPs whose day has come are recorded first
  // (the rest wait for a confirm on Money, Loans or Investments)
  const auto = await runAutomation(supabase, uid, today)

  const [txns, loansRes, accsRes, stocksRes, mfRes, fdRes, insRes, goalsRes, giRes, budgetsRes,
    rdRes, npsRes, licRes, goldRes, bondRes, etfRes, ppfRes, profileRes, fxRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('id,account_id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    activeLoansWithEmi(supabase, uid),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('stocks').select('*').eq('user_id', uid),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('goals').select('*').eq('user_id', uid),
    supabase.from('goal_investments').select('goal_id,investment_type,investment_id,allocation_pct').eq('user_id', uid),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', uid),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', uid),
    supabase.from('bond_investments').select('*').eq('user_id', uid),
    supabase.from('etf_investments').select('*').eq('user_id', uid),
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    supabase.from('profiles').select('full_name,onboarded').eq('id', uid).single(),
    getAedInr(),
  ])
  const extras = await loadWealthExtras(supabase, uid)

  // Live balances: starting balance + transactions since (lib/ledger)
  const liveAccounts = await withLedgerBalances(supabase, uid, accsRes.data ?? [], fxRes.rate)
  const holdings: Holdings = {
    accounts: liveAccounts, stocks: stocksRes.data ?? [], mutualFunds: mfRes.data ?? [],
    etf: etfRes.data ?? [], nps: npsRes.data ?? [], fixedDeposits: fdRes.data ?? [],
    recurringDeposits: rdRes.data ?? [], ppfEpf: ppfRes.data ?? [], gold: goldRes.data ?? [],
    bonds: bondRes.data ?? [], lic: licRes.data ?? [], loans: loansRes.data ?? [],
    otherAssets: extras.otherAssets, gratuity: extras.gratuity, today,
  }

  // Brand-new accounts start with the 4-step setup; anyone with data skips it
  const hasData = txns.length > 0 || Object.values(holdings).some(rows => Array.isArray(rows) && rows.length > 0)
    || (goalsRes.data?.length ?? 0) > 0 || (insRes.data?.length ?? 0) > 0
  if (profileRes.data?.onboarded === false && !hasData) redirect('/onboarding')

  // Record today's net worth (one row per day — re-opening Home updates it).
  // Needs migration 023; until it's run Home shows a "history starts once…" note.
  const fx = fxRes.rate
  const uae = computeNetWorth(holdings, 'uae', fx)
  const india = computeNetWorth(holdings, 'india', fx)
  let historyReady = true
  if (uae.totalAssets + uae.totalLiab + india.totalAssets + india.totalLiab > 0) {
    const all = computeNetWorth(holdings, 'consolidated', fx)
    const { error } = await supabase.from('net_worth_snapshots').upsert({
      user_id: uid, snap_date: today, fx,
      uae_assets: Math.round(uae.totalAssets), uae_liab: Math.round(uae.totalLiab),
      india_assets: Math.round(india.totalAssets), india_liab: Math.round(india.totalLiab),
      breakdown: { ...Object.fromEntries(groupAssets(all.assetRows).map(g => [g.key, Math.round(g.value)])), rules: NW_RULES },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,snap_date' })
    if (isMissingTable(error)) historyReady = false
  }
  const snapsRes = historyReady
    ? await supabase.from('net_worth_snapshots').select('snap_date,fx,uae_assets,uae_liab,india_assets,india_liab,breakdown')
        .eq('user_id', uid).gte('snap_date', histFrom).order('snap_date', { ascending: true })
    : { data: [], error: null }
  if (isMissingTable(snapsRes.error)) historyReady = false

  return (
    <DashboardClient
      firstName={(profileRes.data?.full_name ?? '').split(' ')[0] || null}
      today={today}
      holdings={holdings}
      transactions={txns}
      pendingConfirms={auto.count}
      insurance={insRes.data ?? []}
      budgets={budgetsRes.data ?? []}
      goals={goalsRes.data ?? []}
      goalInvestments={giRes.data ?? []}
      snapshots={snapsRes.data ?? []}
      historyReady={historyReady}
      goalInterests={goalInterestsOf(user!.user_metadata)}
    />
  )
}
