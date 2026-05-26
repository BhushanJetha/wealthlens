import { createClient } from '@/lib/supabase/server'
import MutualFundsClient from '@/components/dashboard/MutualFundsClient'

export default async function MutualFundsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('mutual_funds').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <MutualFundsClient data={data ?? []} />
}
