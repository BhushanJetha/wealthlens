import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadGoalsData } from '@/lib/goalsData'
import GoalsClient from '@/components/dashboard/GoalsClient'

export default async function GoalsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  return <GoalsClient data={await loadGoalsData(supabase, user!.id)} />
}
