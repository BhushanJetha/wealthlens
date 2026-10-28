import { createClient, getSessionUser } from '@/lib/supabase/server'
import GoldClient from '@/components/dashboard/GoldClient'

export default async function GoldPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await supabase.from('gold_investments').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <GoldClient data={data ?? []} />
}
