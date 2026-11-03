import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadGoalsData } from '@/lib/goalsData'
import GoalsClient from '@/components/dashboard/GoalsClient'
import { payFirstModeOf } from '@/lib/plan'

export default async function GoalsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const [data, fresh] = await Promise.all([loadGoalsData(supabase, user!.id), supabase.auth.getUser()])
  return <GoalsClient data={data} payFirst={payFirstModeOf(fresh.data.user?.user_metadata)} />
}
