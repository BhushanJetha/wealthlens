import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { markUnitemisedCardBills } from '@/lib/money'
import BudgetsClient from '@/components/dashboard/BudgetsClient'

// Budgets: 13 months of transactions (this month, last year's history, and
// the 3 months the suggested caps look at) and each month's own budgets.
export default async function BudgetsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, budgetsRes, cardsRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    supabase.from('accounts').select('id').eq('user_id', uid).eq('account_type', 'credit_card'),
  ])

  // A card bill counts only when that month's card purchases weren't imported
  const cardIds = new Set((cardsRes.data ?? []).map((c: any) => c.id))
  return <BudgetsClient today={today} budgets={budgetsRes.data ?? []} transactions={markUnitemisedCardBills(txns, cardIds)} />
}
