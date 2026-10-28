import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import TaxClient from '@/components/dashboard/TaxClient'
import { fyOf } from '@/lib/tax'

export default async function TaxPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const fy = fyOf(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }))

  // Missing tables (migrations not run) just come back empty
  const [pf, mf, inv, nps, npsC, lic, ins, loans, tagged] = await Promise.all([
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    supabase.from('mutual_funds').select('*').eq('user_id', uid).eq('fund_type', 'elss'),
    supabase.from('investment_transactions').select('asset_id,txn_date,txn_type,amount').eq('user_id', uid).eq('asset_type', 'mutual_fund').gte('txn_date', fy.start),
    supabase.from('nps_accounts').select('*').eq('user_id', uid),
    supabase.from('nps_contributions').select('nps_account_id,amount,contribution_date').eq('user_id', uid).gte('contribution_date', fy.start),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
    activeLoansWithEmi(supabase, uid),
    // Expenses tagged with a tax section (migration 027; none before it)
    supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', fy.start).lte('txn_date', fy.end).not('tax_tag', 'is', null),
  ])

  return <TaxClient input={{
    ppfEpf: pf.data ?? [], mutualFunds: mf.data ?? [], invTxns: inv.data ?? [],
    nps: nps.data ?? [], npsContrib: npsC.data ?? [], lic: lic.data ?? [], insurance: ins.data ?? [], loans: loans.data ?? [],
    tagged: tagged.data ?? [],
  }} />
}
