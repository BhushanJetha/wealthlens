import { createClient } from '@/lib/supabase/server'
import MoneyReportClient from '@/components/dashboard/MoneyReportClient'

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, budgetsRes, accountsRes] = await Promise.all([
    supabase.from('transactions')
      .select('txn_date, amount, currency, category, sub_category, txn_type, merchant, account_id')
      .eq('user_id', user!.id)
      .order('txn_date', { ascending: true })
      .limit(10000),
    supabase.from('budgets')
      .select('category, monthly_cap, month_year')
      .eq('user_id', user!.id),
    supabase.from('accounts')
      .select('id, name, bank_name')
      .eq('user_id', user!.id),
  ])

  return (
    <MoneyReportClient
      transactions={txnsRes.data ?? []}
      budgets={budgetsRes.data ?? []}
      accounts={accountsRes.data ?? []}
    />
  )
}
