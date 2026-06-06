import { createClient } from '@/lib/supabase/server'
import LearnClient from '@/components/dashboard/LearnClient'

export default async function LearnPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: funds } = await supabase
    .from('mutual_funds')
    .select('*')
    .eq('user_id', user!.id)

  return <LearnClient funds={funds ?? []} />
}
