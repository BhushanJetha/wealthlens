import { createClient } from '@/lib/supabase/server'
import DebtEquityClient from '@/components/dashboard/DebtEquityClient'

export default async function DebtEquityPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const uid = user.id
  const sel = (t: string) => supabase.from(t).select('*').eq('user_id', uid)

  const [mf, st, etf, fd, rd, nps, lic, gold, bonds, ppf, loans] = await Promise.all([
    sel('mutual_funds'), sel('stocks'), sel('etf_investments'),
    sel('fixed_deposits'), sel('recurring_deposits'), sel('nps_accounts'),
    sel('lic_policies'), sel('gold_investments'), sel('bond_investments'),
    sel('ppf_epf_accounts'), supabase.from('home_loans').select('*').eq('user_id', uid).eq('is_active', true),
  ])

  return (
    <DebtEquityClient
      funds={mf.data ?? []} stocks={st.data ?? []} etfs={etf.data ?? []}
      fds={fd.data ?? []} rds={rd.data ?? []} nps={nps.data ?? []}
      lic={lic.data ?? []} gold={gold.data ?? []} bonds={bonds.data ?? []}
      ppf={ppf.data ?? []} loans={loans.data ?? []}
    />
  )
}
