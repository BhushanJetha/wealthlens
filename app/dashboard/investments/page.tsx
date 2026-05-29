import { createClient } from '@/lib/supabase/server'
import InvestmentsClient from '@/components/dashboard/InvestmentsClient'

export default async function InvestmentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10)

  const [stocksRes, mfRes, fdRes, rdRes, npsRes, licRes, goldRes, bondRes, etfRes, txnsRes, giRes, goalsRes, familyRes] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', user!.id),
    supabase.from('lic_policies').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', user!.id),
    supabase.from('bond_investments').select('*').eq('user_id', user!.id),
    supabase.from('etf_investments').select('*').eq('user_id', user!.id),
    supabase.from('transactions')
      .select('txn_date, amount, currency, country, txn_type, category')
      .eq('user_id', user!.id)
      .in('txn_type', ['income', 'expense'])
      .gte('txn_date', cutoff)
      .order('txn_date', { ascending: false })
      .limit(500),
    supabase.from('goal_investments').select('*').eq('user_id', user!.id),
    supabase.from('goals').select('id, name, icon, color, category, target_amount, target_date, status').eq('user_id', user!.id).eq('status', 'active'),
    supabase.from('family_members').select('id, name, relationship').eq('user_id', user!.id).eq('is_active', true).order('created_at'),
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
      transactions={txnsRes.data ?? []}
      goalInvestments={giRes.data ?? []}
      goals={goalsRes.data ?? []}
      familyMembers={familyRes.data ?? []}
    />
  )
}
