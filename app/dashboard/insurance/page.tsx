import { createClient, getSessionUser } from '@/lib/supabase/server'
import InsuranceClient from '@/components/dashboard/InsuranceClient'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { buildPortfolio } from '@/lib/portfolio/build'

export default async function InsurancePage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const [{ data: policies }, d] = await Promise.all([
    supabase.from('insurance_policies').select('*').eq('user_id', user!.id).order('next_premium_date', { ascending: true }),
    loadPortfolioData(supabase, user!.id),
  ])
  // Is the cover enough? (life cover need vs what you have, health cover)
  const { protection, nominees } = buildPortfolio(d)
  return <InsuranceClient policies={policies ?? []} cover={{ ...protection, nomineesMissing: nominees.ready ? nominees.missing : null, parents: d.members.some(m => /father|mother|parent/i.test(m.relationship)) }} />
}
