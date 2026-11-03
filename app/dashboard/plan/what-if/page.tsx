import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPlanData } from '@/lib/planData'
import WhatIfClient from '@/components/dashboard/plan/WhatIfClient'

export default async function Page() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  return <WhatIfClient data={await loadPlanData(supabase, user!.id)} />
}
