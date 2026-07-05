import { createClient } from '@/lib/supabase/server'
import CashFlowClient from '@/components/dashboard/CashFlowClient'

export default async function CashFlowPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  const since = new Date(); since.setMonth(since.getMonth() - 4)
  const sinceDate = `${since.toISOString().slice(0, 7)}-01`

  const [accountsRes, loansRes, txnsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('home_loans').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('transactions')
      .select('merchant,category,amount,currency,txn_date,txn_type')
      .eq('user_id', uid).gte('txn_date', sinceDate)
      .order('txn_date', { ascending: true }).limit(5000),
  ])

  return (
    <CashFlowClient
      accounts={accountsRes.data ?? []}
      loans={loansRes.data ?? []}
      transactions={txnsRes.data ?? []}
    />
  )
}
