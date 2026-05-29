import { createClient } from '@/lib/supabase/server'
import LoansClient from '@/components/dashboard/LoansClient'

export default async function LoansPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [loansRes, familyRes] = await Promise.all([
    supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('family_members').select('id, name, relationship').eq('user_id', user!.id).eq('is_active', true).order('created_at'),
  ])
  return <LoansClient loans={loansRes.data ?? []} familyMembers={familyRes.data ?? []} />
}
