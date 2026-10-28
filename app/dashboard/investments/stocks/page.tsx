import { createClient, getSessionUser } from '@/lib/supabase/server'
import StocksClient from '@/components/dashboard/StocksClient'

export default async function StocksPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await supabase.from('stocks').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <StocksClient data={data ?? []} />
}
