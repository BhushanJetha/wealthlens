import { createClient } from '@/lib/supabase/server'
import LoansClient from '@/components/dashboard/LoansClient'

export default async function LoansPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: loans } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true)
  return <LoansClient loans={loans ?? []} />
}
