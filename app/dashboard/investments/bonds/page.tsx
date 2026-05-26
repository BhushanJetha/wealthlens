import { createClient } from '@/lib/supabase/server'
import BondsClient from '@/components/dashboard/BondsClient'

export default async function BondsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('bond_investments').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <BondsClient data={data ?? []} />
}
