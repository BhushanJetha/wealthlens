import { createClient } from '@/lib/supabase/server'
import BudgetsClient from '@/components/dashboard/BudgetsClient'

export default async function BudgetsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const thisMonth = new Date().toISOString().slice(0, 7)

  const [budgetsRes, txnsRes] = await Promise.all([
    supabase.from('budgets').select('*').eq('user_id', user!.id).eq('month_year', thisMonth),
    supabase.from('transactions').select('category,amount,currency,txn_date')
      .eq('user_id', user!.id).gte('txn_date', `${thisMonth}-01`),
  ])

  return (
    <BudgetsClient
      budgets={budgetsRes.data ?? []}
      transactions={txnsRes.data ?? []}
    />
  )
}
