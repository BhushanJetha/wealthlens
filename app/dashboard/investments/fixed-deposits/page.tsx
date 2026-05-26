import { createClient } from '@/lib/supabase/server'
import FixedDepositsClient from '@/components/dashboard/FixedDepositsClient'

export default async function FixedDepositsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <FixedDepositsClient data={data ?? []} />
}
