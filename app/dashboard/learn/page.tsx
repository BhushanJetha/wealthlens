import { createClient, getSessionUser } from '@/lib/supabase/server'
import LearnClient from '@/components/dashboard/LearnClient'

export default async function LearnPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)

  const { data: funds } = await supabase
    .from('mutual_funds')
    .select('*')
    .eq('user_id', user!.id)

  return <LearnClient funds={funds ?? []} />
}
