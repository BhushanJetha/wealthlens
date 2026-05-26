import { createClient } from '@/lib/supabase/server'
import RecurringDepositsClient from '@/components/dashboard/RecurringDepositsClient'

export default async function RecurringDepositsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('recurring_deposits').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <RecurringDepositsClient data={data ?? []} />
}
