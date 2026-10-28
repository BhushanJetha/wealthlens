import { createClient, getSessionUser } from '@/lib/supabase/server'
import FixedDepositsClient from '@/components/dashboard/FixedDepositsClient'

export default async function FixedDepositsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await supabase.from('fixed_deposits').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <FixedDepositsClient data={data ?? []} />
}
