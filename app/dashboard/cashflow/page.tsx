import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { activeLoansWithEmi } from '@/lib/loans'
import CashFlowClient from '@/components/dashboard/CashFlowClient'

export default async function CashFlowPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id

  const since = new Date(); since.setMonth(since.getMonth() - 4)
  const sinceDate = `${since.toISOString().slice(0, 7)}-01`

  const [accountsRes, loansRes, txnsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    activeLoansWithEmi(supabase, uid),
    fetchAll((a, b) => supabase.from('transactions')
      .select('merchant,category,amount,currency,txn_date,txn_type')
      .eq('user_id', uid).gte('txn_date', sinceDate)
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
  ])

  return (
    <CashFlowClient
      accounts={accountsRes.data ?? []}
      loans={loansRes.data ?? []}
      transactions={txnsRes.data ?? []}
    />
  )
}
