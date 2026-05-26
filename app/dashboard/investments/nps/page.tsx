import { createClient } from '@/lib/supabase/server'
import NpsClient from '@/components/dashboard/NpsClient'

export default async function NpsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('nps_accounts').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <NpsClient data={data ?? []} />
}
