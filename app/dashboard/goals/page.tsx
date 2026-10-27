import { createClient } from '@/lib/supabase/server'
import { loadGoalsData } from '@/lib/goalsData'
import GoalsClient from '@/components/dashboard/GoalsClient'

export default async function GoalsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <GoalsClient data={await loadGoalsData(supabase, user!.id)} />
}
