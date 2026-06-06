import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/dashboard/BudgetsClient'

export default async function BudgetsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisYear  = new Date().getFullYear()
  const yearStart = `${thisYear}-01-01`
  const yearEnd   = `${thisYear}-12-31`

  const [budgetsRes, txnsRes, incomeRes] = await Promise.all([
    supabase.from('budgets').select('*').eq('user_id', user!.id).eq('month_year', thisMonth),
    supabase.from('transactions')
      .select('category,amount,currency,txn_date,merchant')
      .eq('user_id', user!.id)
      .in('txn_type', ['expense', 'transfer', 'loan'])
      .gte('txn_date', yearStart)
      .lte('txn_date', yearEnd),
    supabase.from('transactions')
      .select('amount,currency,txn_date')
      .eq('user_id', user!.id)
      .eq('txn_type', 'income')
      .gte('txn_date', yearStart)
      .lte('txn_date', yearEnd),
  ])

  return (
    <BudgetsClient
      budgets={budgetsRes.data ?? []}
      transactions={txnsRes.data ?? []}
      incomeTransactions={incomeRes.data ?? []}
    />
  )
}
