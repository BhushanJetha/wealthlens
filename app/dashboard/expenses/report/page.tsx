import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import ExpensesReportClient from '@/components/dashboard/ExpensesReportClient'

export default async function ExpensesReportPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const thisMonth = new Date().toISOString().slice(0, 7)

  // accounts!account_id: transactions link to accounts twice (account_id and,
  // since migration 026, counter_account_id) — a bare accounts(...) embed is
  // ambiguous and PostgREST returns an error instead of rows
  const [txnsRes, incomeRes, budgetsRes] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('*, accounts!account_id(name,bank_name,account_type,last_four)')
      .eq('user_id', uid).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('transactions').select('*, accounts!account_id(name,bank_name)')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    supabase.from('budgets').select('*').eq('user_id', uid).eq('month_year', thisMonth),
  ])

  const txns = txnsRes.data ?? []
  // Income rows only; the client pairs UAE → India remittances from `txns`
  // into "Received from UAE" India income (lib/money)
  const income = incomeRes.data ?? []

  return (
    <ExpensesReportClient
      transactions={txns}
      incomeTransactions={income}
      budgets={budgetsRes.data ?? []}
    />
  )
}
