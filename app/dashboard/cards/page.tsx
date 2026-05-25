import { createClient } from '@/lib/supabase/server'
import CardsClient from '@/components/dashboard/CardsClient'

export default async function CardsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', user!.id).eq('account_type', 'credit_card').eq('is_active', true)
  return <CardsClient cards={accounts ?? []} />
}
