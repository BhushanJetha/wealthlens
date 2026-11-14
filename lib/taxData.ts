// What the tax planner counts this financial year (lib/tax planTax), read in
// one go: PPF / EPF, ELSS funds and their payments this FY, NPS and its
// contributions, LIC, insurance, home loans and expenses tagged with a
// section. Missing tables (migrations not run) come back empty.
import { activeLoansWithEmi } from './loans'
import { fyOf, type TaxInput } from './tax'

export async function loadTaxInput(supabase: any, uid: string, today: string): Promise<TaxInput> {
  const fy = fyOf(today)
  const opt = (q: any) => q.then((r: any) => r.data ?? [], () => [])
  const [ppfEpf, mutualFunds, invTxns, nps, npsContrib, lic, insurance, loans, tagged] = await Promise.all([
    opt(supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid)),
    opt(supabase.from('mutual_funds').select('*').eq('user_id', uid).eq('fund_type', 'elss')),
    opt(supabase.from('investment_transactions').select('asset_id,txn_date,txn_type,amount').eq('user_id', uid).eq('asset_type', 'mutual_fund').gte('txn_date', fy.start)),
    opt(supabase.from('nps_accounts').select('*').eq('user_id', uid)),
    opt(supabase.from('nps_contributions').select('nps_account_id,amount,contribution_date').eq('user_id', uid).gte('contribution_date', fy.start)),
    opt(supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true)),
    opt(supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true)),
    activeLoansWithEmi(supabase, uid).then((r: any) => r.data ?? [], () => []),
    opt(supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', fy.start).lte('txn_date', fy.end).not('tax_tag', 'is', null)),
  ])
  return { ppfEpf, mutualFunds, invTxns, nps, npsContrib, lic, insurance, loans, tagged }
}
