import { createClient } from '@/lib/supabase/server'
import IncomeReportClient from '@/components/dashboard/IncomeReportClient'
import { isNroSettled, toNroIncome } from '@/lib/nro'

export default async function IncomeReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const [incomeRes, transfersRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }),
    supabase.from('transactions').select('*')
      .eq('user_id', uid).eq('txn_type', 'transfer')
      .order('txn_date', { ascending: true }).limit(2000),
  ])

  // NRO settlements are the effective India income — surface them as
  // "UAE Income (NRO)" so the report matches the Income tab & Transfers.
  const nroIncome = (transfersRes.data ?? []).filter(isNroSettled).map(toNroIncome)
  const transactions = [...(incomeRes.data ?? []), ...nroIncome]

  return <IncomeReportClient transactions={transactions} />
}
