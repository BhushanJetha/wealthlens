import { createClient } from '@/lib/supabase/server'
import ExpensesReportClient from '@/components/dashboard/ExpensesReportClient'

const NRO_CATS = new Set(['NRE to NRO', 'NRO Settled', 'NRE → NRO'])
const isNroSettlement = (t: any) => NRO_CATS.has(t.category) || t.sub_category === 'Internal'

export default async function ExpensesReportPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [txnsRes, incomeRes, budgetsRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('user_id', uid).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: true }).limit(8000),
    supabase.from('transactions').select('amount,currency,txn_date,category')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }).limit(5000),
    supabase.from('budgets').select('*').eq('user_id', uid).eq('month_year', thisMonth),
  ])

  const txns = txnsRes.data ?? []
  // NRO settlements are the effective India income for NRIs without local salary
  const nroIncome = txns.filter(isNroSettlement).map((t: any) => ({
    amount: t.amount, currency: t.currency, txn_date: t.txn_date, category: 'UAE Income (NRO)',
  }))
  const income = [...(incomeRes.data ?? []), ...nroIncome]

  return (
    <ExpensesReportClient
      transactions={txns}
      incomeTransactions={income}
      budgets={budgetsRes.data ?? []}
    />
  )
}
