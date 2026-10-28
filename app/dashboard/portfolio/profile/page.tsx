import { createClient, getSessionUser } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/missingTable'
import ProfileClient from '@/components/dashboard/PortfolioProfileClient'

// Investor profile: the questions and your target mix (migration 032)
export default async function PortfolioProfilePage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data, error } = await supabase.from('investor_profile').select('answers,targets').eq('user_id', user!.id).maybeSingle()
  return <ProfileClient answers={data?.answers ?? {}} targets={data?.targets ?? null} ready={!isMissingTable(error) && !error} />
}
