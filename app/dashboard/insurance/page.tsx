import { createClient, getSessionUser } from '@/lib/supabase/server'
import InsuranceClient from '@/components/dashboard/InsuranceClient'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { buildPortfolio } from '@/lib/portfolio/build'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

export default async function InsurancePage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const [{ data: policies }, d, premiums] = await Promise.all([
    supabase.from('insurance_policies').select('*').eq('user_id', user!.id).order('next_premium_date', { ascending: true }),
    loadPortfolioData(supabase, user!.id),
    // Premiums you've recorded, all years (lib/insurancePaid matches them to each policy)
    fetchAllRows((a, b) => supabase.from('transactions').select('id,txn_date,amount,currency,txn_type,category,sub_category,merchant,description').eq('user_id', user!.id)
      .or('category.ilike.%insur%,sub_category.ilike.%insur%,merchant.ilike.%insur%,merchant.ilike.%premium%,description.ilike.%premium%,description.ilike.%policy%')
      .order('txn_date').order('id').range(a, b), 5),
  ])
  // Is the cover enough? (life cover need vs what you have, health cover)
  const { protection, nominees } = buildPortfolio(d)
  return <InsuranceClient premiums={premiums} today={d.today} policies={policies ?? []} cover={{ ...protection, nomineesMissing: nominees.ready ? nominees.missing : null, parents: d.members.some(m => /father|mother|parent/i.test(m.relationship)) }} />
}
