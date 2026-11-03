import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPlanData } from '@/lib/planData'
import PlanYearClient from '@/components/dashboard/plan/PlanYearClient'

export default async function Page() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  return <PlanYearClient data={await loadPlanData(supabase, user!.id)} />
}
