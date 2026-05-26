import { createClient } from '@/lib/supabase/server'
import InvestmentsClient from '@/components/dashboard/InvestmentsClient'

export default async function InvestmentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [stocksRes, mfRes, fdRes, rdRes, npsRes, licRes, goldRes, bondRes, etfRes] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', user!.id),
    supabase.from('lic_policies').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', user!.id),
    supabase.from('bond_investments').select('*').eq('user_id', user!.id),
    supabase.from('etf_investments').select('*').eq('user_id', user!.id),
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
    />
  )
}
