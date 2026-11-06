import { createClient, getSessionUser } from '@/lib/supabase/server'
import MutualFundsClient from '@/components/dashboard/MutualFundsClient'

export default async function MutualFundsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) return null
  const { data: funds } = await supabase
    .from('mutual_funds').select('*').eq('user_id', user.id)
    .order('invested_amount', { ascending: false })
  // A fund sold in full leaves the list; its sales stay in the capital gains report
  return <MutualFundsClient funds={(funds ?? []).filter((f: any) => f.units == null || Number(f.units) > 0.0005)} />
}
