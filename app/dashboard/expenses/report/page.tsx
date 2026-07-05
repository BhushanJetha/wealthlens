import { createClient } from '@/lib/supabase/server'
import ExpensesReportClient from '@/components/dashboard/ExpensesReportClient'
import { isNroSettled, toNroIncome } from '@/lib/nro'

export default async function ExpensesReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [txnsRes, incomeRes, budgetsRes] = await Promise.all([
    supabase.from('transactions').select('*, accounts(name,bank_name,account_type)')
      .eq('user_id', uid).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: true }).limit(8000),
    supabase.from('transactions').select('amount,currency,txn_date,category,account_id, accounts(name,bank_name)')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }).limit(5000),
    supabase.from('budgets').select('*').eq('user_id', uid).eq('month_year', thisMonth),
  ])

  const txns = txnsRes.data ?? []
  // NRO settlements are the effective India income for NRIs without local salary
  const nroIncome = txns.filter(isNroSettled).map(toNroIncome)
  const income = [...(incomeRes.data ?? []), ...nroIncome]

  return (
    <ExpensesReportClient
      transactions={txns}
      incomeTransactions={income}
      budgets={budgetsRes.data ?? []}
    />
  )
}
