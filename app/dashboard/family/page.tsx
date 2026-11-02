import { redirect } from 'next/navigation'
import { createClient, createClientFor, getRealSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { withLedgerBalances } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import { loadWealthExtras } from '@/lib/wealthExtras'
import WholeFamilyClient from '@/components/dashboard/WholeFamilyClient'
import type { FamilyPerson } from '@/lib/familyView'

// Whole family: everything an owner reads for Home, once per person, each read
// under that person's own access (the database still checks the link). Read only.
export default async function WholeFamilyPage() {
  const me = createClientFor(null)
  const user = await getRealSessionUser(createClient())
  const uid = user!.id
  const { data: links } = await me.from('family_links').select('member_id,name,status').eq('owner_id', uid).eq('status', 'active')
  const members = (links ?? []).filter((l: any) => l.member_id)
  if (!members.length) redirect('/dashboard/settings/family')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`
  const { rate } = await getAedInr()

  const load = async (id: string, name: string, isMe: boolean): Promise<FamilyPerson> => {
    const sb = isMe ? me : createClientFor(id)
    const [txns, loans, accs, stocks, mf, fd, ins, budgets, rd, nps, lic, gold, bond, etf, ppf, extras, rec] = await Promise.all([
      fetchAllRows((a, b) => sb.from('transactions').select('*').eq('user_id', id).gte('txn_date', fromDate).order('txn_date', { ascending: false }).order('id').range(a, b)),
      activeLoansWithEmi(sb, id),
      sb.from('accounts').select('*').eq('user_id', id).eq('is_active', true),
      sb.from('stocks').select('*').eq('user_id', id),
      sb.from('mutual_funds').select('*').eq('user_id', id),
      sb.from('fixed_deposits').select('*').eq('user_id', id).eq('is_active', true),
      sb.from('insurance_policies').select('*').eq('user_id', id).eq('is_active', true),
      sb.from('budgets').select('*').eq('user_id', id).gte('month_year', fromDate.slice(0, 7)),
      sb.from('recurring_deposits').select('*').eq('user_id', id).eq('is_active', true),
      sb.from('nps_accounts').select('*').eq('user_id', id),
      sb.from('lic_policies').select('*').eq('user_id', id).eq('is_active', true),
      sb.from('gold_investments').select('*').eq('user_id', id),
      sb.from('bond_investments').select('*').eq('user_id', id),
      sb.from('etf_investments').select('*').eq('user_id', id),
      sb.from('ppf_epf_accounts').select('*').eq('user_id', id),
      loadWealthExtras(sb, id),
      sb.from('recurring_txns').select('*').eq('user_id', id),
    ])
    const accounts = await withLedgerBalances(sb, id, accs.data ?? [], rate)
    return {
      id, name, isMe, transactions: txns, insurance: ins.data ?? [], budgets: budgets.data ?? [], recurring: rec.data ?? [],
      holdings: {
        accounts, stocks: stocks.data ?? [], mutualFunds: mf.data ?? [], etf: etf.data ?? [], nps: nps.data ?? [], fixedDeposits: fd.data ?? [],
        recurringDeposits: rd.data ?? [], ppfEpf: ppf.data ?? [], gold: gold.data ?? [], bonds: bond.data ?? [], lic: lic.data ?? [], loans: loans.data ?? [],
        otherAssets: extras.otherAssets, gratuity: extras.gratuity, today,
      },
    }
  }
  const people = await Promise.all([load(uid, 'You', true), ...members.map((m: any) => load(m.member_id, m.name, false))])
  return <WholeFamilyClient today={today} people={people} />
}
