import { createClient } from '@/lib/supabase/server'
import NetWorthClient from '@/components/dashboard/NetWorthClient'

export default async function NetWorthPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  // 18 months of income/expense for the savings trend
  const from = new Date(); from.setMonth(from.getMonth() - 17)
  const fromDate = `${from.toISOString().slice(0, 7)}-01`

  const [
    accountsRes, stocksRes, mfRes, etfRes, npsRes,
    fdRes, rdRes, ppfRes, goldRes, bondRes, licRes, loansRes, txnsRes,
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('stocks').select('*').eq('user_id', uid),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('etf_investments').select('*').eq('user_id', uid),
    supabase.from('nps_accounts').select('*').eq('user_id', uid),
    supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    supabase.from('gold_investments').select('*').eq('user_id', uid),
    supabase.from('bond_investments').select('*').eq('user_id', uid),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('home_loans').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('transactions').select('txn_type,amount,currency,txn_date,category')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: true }).limit(5000),
  ])

  return (
    <NetWorthClient
      accounts={accountsRes.data ?? []}
      stocks={stocksRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      etf={etfRes.data ?? []}
      nps={npsRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      recurringDeposits={rdRes.data ?? []}
      ppfEpf={ppfRes.data ?? []}
      gold={goldRes.data ?? []}
      bonds={bondRes.data ?? []}
      lic={licRes.data ?? []}
      loans={loansRes.data ?? []}
      transactions={txnsRes.data ?? []}
    />
  )
}
