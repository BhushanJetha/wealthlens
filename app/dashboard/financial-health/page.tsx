import { createClient } from '@/lib/supabase/server'
import FinancialHealthClient from '@/components/dashboard/FinancialHealthClient'

export default async function FinancialHealthPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    stocksRes, mfRes, fdRes, rdRes, npsRes, licRes,
    goldRes, bondRes, etfRes, loansRes, txnsRes,
  ] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', user!.id),
    supabase.from('lic_policies').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', user!.id),
    supabase.from('bond_investments').select('*').eq('user_id', user!.id),
    supabase.from('etf_investments').select('*').eq('user_id', user!.id),
    supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('transactions').select('txn_type,amount,currency,txn_date').eq('user_id', user!.id)
      .eq('txn_type', 'income').order('txn_date', { ascending: false }).limit(200),
  ])

  return (
    <FinancialHealthClient
      stocks={stocksRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      recurringDeposits={rdRes.data ?? []}
      npsAccounts={npsRes.data ?? []}
      licPolicies={licRes.data ?? []}
      goldInvestments={goldRes.data ?? []}
      bondInvestments={bondRes.data ?? []}
      etfInvestments={etfRes.data ?? []}
      loans={loansRes.data ?? []}
      transactions={txnsRes.data ?? []}
    />
  )
}
