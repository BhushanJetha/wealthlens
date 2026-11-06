import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getAedInr } from '@/lib/fx'
import { fyOf } from '@/lib/tax'
import { nriKindOf } from '@/lib/ledger'
import { nroSentOut } from '@/lib/nriTax'
import NriToolkitClient from '@/components/dashboard/NriToolkitClient'

// NRI toolkit: gratuity, residency, NRE/NRO — and what you've actually sent
// out of NRO this financial year against the USD 1 million limit
export default async function NriToolkitPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const fy = fyOf(today)
  const [accRes, fx] = await Promise.all([supabase.from('accounts').select('*').eq('user_id', uid), getAedInr()])
  const accounts = accRes.data ?? []
  const nro = accounts.filter((a: any) => nriKindOf(a) === 'nro').map((a: any) => a.id)
  const txns = nro.length ? await fetchAllRows((a, b) => supabase.from('transactions').select('id,account_id,txn_date,amount,currency,txn_type,category,merchant,description')
    .eq('user_id', uid).in('account_id', nro).gte('txn_date', fy.start).lte('txn_date', fy.end).order('txn_date').order('id').range(a, b)) : []
  const sent = nro.length ? { ...nroSentOut(accounts, txns, fy.label, fx.rate), fy: fy.label, rows: undefined } : null
  return <NriToolkitClient sent={sent} />
}
