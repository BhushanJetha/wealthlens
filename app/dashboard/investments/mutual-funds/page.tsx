import { createClient, getSessionUser } from '@/lib/supabase/server'
import MutualFundsClient from '@/components/dashboard/MutualFundsClient'

export default async function MutualFundsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) return null
  const { data: funds } = await supabase
    .from('mutual_funds').select('*').eq('user_id', user.id)
    .order('invested_amount', { ascending: false })
  return <MutualFundsClient funds={funds ?? []} />
}
