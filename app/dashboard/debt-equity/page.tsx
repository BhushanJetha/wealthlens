import { createClient } from '@/lib/supabase/server'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import DebtEquityClient from '@/components/dashboard/DebtEquityClient'
import { activeLoansWithEmi } from '@/lib/loans'
import { loadWealthExtras } from '@/lib/wealthExtras'

export default async function DebtEquityPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const uid = user.id
  const sel = (t: string) => supabase.from(t).select('*').eq('user_id', uid)
  const active = (t: string) => sel(t).eq('is_active', true)

  // Same holdings (and active filters) as the Net worth page, so both agree
  const [accounts, mf, st, etf, fd, rd, nps, lic, gold, bonds, ppf, loans] = await Promise.all([
    activeAccountsWithLedger(supabase, uid, (await getAedInr()).rate), sel('mutual_funds'), sel('stocks'), sel('etf_investments'),
    active('fixed_deposits'), active('recurring_deposits'), sel('nps_accounts'),
    active('lic_policies'), sel('gold_investments'), sel('bond_investments'),
    sel('ppf_epf_accounts'), activeLoansWithEmi(supabase, uid),
  ])
  const extras = await loadWealthExtras(supabase, uid)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })

  return (
    <DebtEquityClient holdings={{
      accounts: accounts.data ?? [], mutualFunds: mf.data ?? [], stocks: st.data ?? [], etf: etf.data ?? [],
      fixedDeposits: fd.data ?? [], recurringDeposits: rd.data ?? [], nps: nps.data ?? [],
      lic: lic.data ?? [], gold: gold.data ?? [], bonds: bonds.data ?? [], ppfEpf: ppf.data ?? [], loans: loans.data ?? [],
      otherAssets: extras.otherAssets, gratuity: extras.gratuity, today,
    }} />
  )
}
