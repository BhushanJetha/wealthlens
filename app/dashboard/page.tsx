import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, loansRes, accsRes, stocksRes, mfRes, fdRes, insRes, goalsRes, budgetsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user!.id).order('txn_date', { ascending: false }).limit(500),
    supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('accounts').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('insurance_policies').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('goals').select('*').eq('user_id', user!.id),
    supabase.from('budgets').select('*').eq('user_id', user!.id),
  ])

  return (
    <DashboardClient
      transactions={txnsRes.data ?? []}
      loans={loansRes.data ?? []}
      accounts={accsRes.data ?? []}
      stocks={stocksRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      insurance={insRes.data ?? []}
      goals={goalsRes.data ?? []}
      budgets={budgetsRes.data ?? []}
    />
  )
}
