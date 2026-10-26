import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import BudgetsClient from '@/components/dashboard/BudgetsClient'

export default async function BudgetsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisYear  = new Date().getFullYear()
  const yearStart = `${thisYear}-01-01`
  const yearEnd   = `${thisYear}-12-31`
  // Fetch income back 6 months even if it crosses into last year, so the
  // budget page can average the salary across recent months.
  const d6 = new Date(); d6.setMonth(d6.getMonth() - 6)
  const histStart   = d6.toISOString().slice(0, 10)
  const incomeStart = histStart < yearStart ? histStart : yearStart

  const [budgetsRes, txnsRes, incomeRes] = await Promise.all([
    supabase.from('budgets').select('*').eq('user_id', user!.id).eq('month_year', thisMonth),
    fetchAll((a, b) => supabase.from('transactions')
      .select('category,amount,currency,txn_date,merchant,txn_type,sub_category')
      .eq('user_id', user!.id)
      .in('txn_type', ['expense', 'transfer', 'loan'])
      .gte('txn_date', yearStart)
      .lte('txn_date', yearEnd)
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('transactions')
      .select('id,amount,currency,txn_date,category,txn_type')
      .eq('user_id', user!.id)
      .eq('txn_type', 'income')
      .gte('txn_date', incomeStart)
      .lte('txn_date', yearEnd)
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
  ])

  // Income rows plus transfers: the client keeps what counts as income in the
  // current view (UAE → India remittances become India income — lib/money)
  const incomeTransactions = [...(incomeRes.data ?? []), ...(txnsRes.data ?? []).filter((t: any) => t.txn_type === 'transfer')]

  return (
    <BudgetsClient
      budgets={budgetsRes.data ?? []}
      transactions={txnsRes.data ?? []}
      incomeTransactions={incomeTransactions}
    />
  )
}
