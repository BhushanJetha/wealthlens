import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPlanData } from '@/lib/planData'
import { loadTaxInput } from '@/lib/taxData'
import PlanHomeClient from '@/components/dashboard/plan/PlanHomeClient'

// Plan › Overview: what every Plan page reads, plus this year's tax picture (read alongside)
export default async function Page() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const [data, tax] = await Promise.all([loadPlanData(supabase, user!.id), loadTaxInput(supabase, user!.id, today)])
  return <PlanHomeClient data={data} tax={tax} />
}
