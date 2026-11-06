import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import TaxClient from '@/components/dashboard/TaxClient'
import { fyOf } from '@/lib/tax'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import TaxGainsInterest from '@/components/dashboard/TaxGainsInterest'

export default async function TaxPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const fy = fyOf(today)
  const lastFyStart = `${Number(fy.start.slice(0, 4)) - 1}-04-01`

  // Missing tables (migrations not run) just come back empty
  const [pf, mf, inv, nps, npsC, lic, ins, loans, tagged, [allMf, stocks, etf, allInv, accounts, interest]] = await Promise.all([
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    supabase.from('mutual_funds').select('*').eq('user_id', uid).eq('fund_type', 'elss'),
    supabase.from('investment_transactions').select('asset_id,txn_date,txn_type,amount').eq('user_id', uid).eq('asset_type', 'mutual_fund').gte('txn_date', fy.start),
    supabase.from('nps_accounts').select('*').eq('user_id', uid),
    supabase.from('nps_contributions').select('nps_account_id,amount,contribution_date').eq('user_id', uid).gte('contribution_date', fy.start),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    activeLoansWithEmi(supabase, uid),
    // Expenses tagged with a tax section (migration 027; none before it)
    supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', fy.start).lte('txn_date', fy.end).not('tax_tag', 'is', null),
    // Capital gains (every sale, with what it was bought from) and interest in India
    Promise.all([
      supabase.from('mutual_funds').select('*').eq('user_id', uid),
      supabase.from('stocks').select('*').eq('user_id', uid),
      supabase.from('etf_investments').select('*').eq('user_id', uid),
      fetchAllRows((a, b) => supabase.from('investment_transactions').select('*').eq('user_id', uid).order('txn_date').order('id').range(a, b)),
      supabase.from('accounts').select('*').eq('user_id', uid),
      fetchAllRows((a, b) => supabase.from('transactions').select('id,account_id,txn_date,amount,currency,txn_type,category,merchant,description').eq('user_id', uid).gte('txn_date', lastFyStart)
        .or('category.ilike.%interest%,merchant.ilike.%tds%,description.ilike.%tds%,description.ilike.%tax deducted%').order('txn_date').order('id').range(a, b)),
    ]),
  ])

  const gains = <TaxGainsInterest today={today} fy={fy.label} invTxns={allInv} accounts={accounts.data ?? []} txns={interest}
    holdings={{ mutual_funds: allMf.data ?? [], stocks: stocks.data ?? [], etf_investments: etf.data ?? [] }} />
  return <TaxClient gains={gains} input={{
    ppfEpf: pf.data ?? [], mutualFunds: mf.data ?? [], invTxns: inv.data ?? [],
    nps: nps.data ?? [], npsContrib: npsC.data ?? [], lic: lic.data ?? [], insurance: ins.data ?? [], loans: loans.data ?? [],
    tagged: tagged.data ?? [],
  }} />
}
