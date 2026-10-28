import { createClient, getSessionUser } from '@/lib/supabase/server'
import EtfClient from '@/components/dashboard/EtfClient'

export default async function EtfPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await supabase.from('etf_investments').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <EtfClient data={data ?? []} />
}
