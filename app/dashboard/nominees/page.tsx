import { createClient } from '@/lib/supabase/server'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { nomineeRows } from '@/lib/portfolio/protection'
import NomineesClient from '@/components/dashboard/NomineesClient'

// Nominees: every bank account, investment, policy and asset in one checklist
export default async function NomineesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const d = await loadPortfolioData(supabase, user!.id, { txMonths: 1 })
  const { rows, ready } = nomineeRows(d.holdings, d.insurance)
  return <NomineesClient rows={rows} ready={ready} members={d.members.filter(m => !/self/i.test(m.relationship)).map(m => m.name)} />
}
