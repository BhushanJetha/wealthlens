import { createClient } from '@/lib/supabase/server'
import IncomeClient from '@/components/dashboard/IncomeClient'

// NRE → NRO settlements represent money reaching the account the user spends
// from, so for NRIs without an India salary they ARE the effective India income.
const NRO_CATS = new Set(['NRE to NRO', 'NRO Settled', 'NRE → NRO'])
const isNroSettlement = (t: any) => NRO_CATS.has(t.category) || t.sub_category === 'Internal'

export default async function IncomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes, transfersRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('user_id', user!.id).eq('txn_type', 'income')
      .order('txn_date', { ascending: false }).limit(500),
    supabase.from('accounts').select('id,name,bank_name').eq('user_id', user!.id),
    supabase.from('transactions').select('*')
      .eq('user_id', user!.id).eq('txn_type', 'transfer')
      .order('txn_date', { ascending: false }).limit(500),
  ])

  const allTransfers = transfersRes.data ?? []
  // Auto-link NRO settlements as "UAE Income (NRO)" income (display only — the
  // underlying rows stay transfers, so Transfers tab / reports are unchanged).
  const nroIncome = allTransfers.filter(isNroSettlement).map((t: any) => ({
    ...t, txn_type: 'income', category: 'UAE Income (NRO)', _autoNro: true,
  }))
  const incomeTxns = [...(txnsRes.data ?? []), ...nroIncome]
    .sort((a: any, b: any) => (a.txn_date < b.txn_date ? 1 : -1))
  const internationalTransfers = allTransfers.filter((t: any) => t.sub_category === 'International')

  return (
    <IncomeClient
      transactions={incomeTxns}
      accounts={accsRes.data ?? []}
      transfers={internationalTransfers}
    />
  )
}
