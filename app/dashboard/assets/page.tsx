import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import { isMissingTable } from '@/lib/supabase/missingTable'
import AssetsClient from '@/components/dashboard/AssetsClient'

// Property & assets: homes, land, vehicles, jewellery, investments held
// outside the usual types (migration 032), and UAE gratuity
export default async function AssetsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const [oa, prof, loans] = await Promise.all([
    supabase.from('other_assets').select('*').eq('user_id', uid).eq('is_active', true).order('created_at'),
    supabase.from('investor_profile').select('gratuity').eq('user_id', uid).maybeSingle(),
    activeLoansWithEmi(supabase, uid),
  ])
  return <AssetsClient today={today} assets={oa.data ?? []} ready={!isMissingTable(oa.error) && !oa.error} gratuity={prof.data?.gratuity ?? null} loans={loans.data ?? []} />
}
