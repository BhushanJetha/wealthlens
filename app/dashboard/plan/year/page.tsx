import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPlanData } from '@/lib/planData'
import PlanYearClient from '@/components/dashboard/plan/PlanYearClient'
import { WithViews } from '@/components/layout/ViewChips'

export default async function Page() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  return <WithViews of="forecast" label="Forecast view"><PlanYearClient data={await loadPlanData(supabase, user!.id)} /></WithViews>
}
