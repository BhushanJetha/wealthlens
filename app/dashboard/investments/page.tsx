import { createClient } from '@/lib/supabase/server'
import InvestmentsClient from '@/components/dashboard/InvestmentsClient'

export default async function InvestmentsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [stocksRes, mfRes, fdRes, rdRes] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).eq('is_active', true),
  ])

  return (
    <InvestmentsClient
      stocks={stocksRes.data ?? []}
      mutualFunds={mfRes.data ?? []}
      fixedDeposits={fdRes.data ?? []}
      recurringDeposits={rdRes.data ?? []}
    />
  )
}
