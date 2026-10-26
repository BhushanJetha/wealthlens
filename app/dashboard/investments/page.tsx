import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import InvestmentsClient from '@/components/dashboard/InvestmentsClient'

export default async function InvestmentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10)

  // Dated purchases / SIPs for the monthly chart. A CAS import can hold
  // thousands of rows and Supabase returns 1,000 per request, so page through.
  // (A missing table — migration 012 not run — just means no records.)
  const loadInvTxns = async () => {
    const out: any[] = []
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from('investment_transactions')
        .select('asset_type, asset_id, txn_date, txn_type, amount')
        .eq('user_id', user!.id).order('txn_date', { ascending: true }).range(from, from + 999)
      if (error || !data) break
      out.push(...data)
      if (data.length < 1000) break
    }
    return out
  }

  const [stocksRes, mfRes, fdRes, rdRes, npsRes, licRes, goldRes, bondRes, etfRes, ppfRes, txnsRes, giRes, goalsRes, familyRes, invTxns] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', user!.id),
    supabase.from('lic_policies').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', user!.id),
    supabase.from('bond_investments').select('*').eq('user_id', user!.id),
    supabase.from('etf_investments').select('*').eq('user_id', user!.id),
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', user!.id),
    fetchAll((a, b) => supabase.from('transactions')
      .select('txn_date, amount, currency, country, txn_type, category')
      .eq('user_id', user!.id)
      .in('txn_type', ['income', 'expense'])
      .gte('txn_date', cutoff)
      .order('txn_date', { ascending: false })
      .order('id').range(a, b)),
    supabase.from('goal_investments').select('*').eq('user_id', user!.id),
    supabase.from('goals').select('id, name, icon, color, category, target_amount, target_date, status').eq('user_id', user!.id).eq('status', 'active'),
    supabase.from('family_members').select('id, name, relationship').eq('user_id', user!.id).eq('is_active', true).order('created_at'),
    loadInvTxns(),
  ])

  return (
    <InvestmentsClient
      stocks={stocksRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      recurringDeposits={rdRes.data ?? []}
      npsAccounts={npsRes.data ?? []}
      licPolicies={licRes.data ?? []}
      goldInvestments={goldRes.data ?? []}
      bondInvestments={bondRes.data ?? []}
      etfInvestments={etfRes.data ?? []}
      ppfEpf={ppfRes.data ?? []}
      invTxns={invTxns}
      transactions={txnsRes.data ?? []}
      goalInvestments={giRes.data ?? []}
      goals={goalsRes.data ?? []}
      familyMembers={familyRes.data ?? []}
    />
  )
}
