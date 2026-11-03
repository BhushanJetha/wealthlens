import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPlanData } from '@/lib/planData'
import PlanHomeClient from '@/components/dashboard/plan/PlanHomeClient'

export default async function Page() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  return <PlanHomeClient data={await loadPlanData(supabase, user!.id)} />
}
