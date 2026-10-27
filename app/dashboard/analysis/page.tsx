import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import AnalysisClient from '@/components/dashboard/AnalysisClient'
import { markUnitemisedCardBills } from '@/lib/money'

export default async function AnalysisPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // 13 months back covers "same month last year"
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, budgetsRes, cardsRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('budgets').select('category,monthly_cap,currency,month_year').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    supabase.from('accounts').select('id').eq('user_id', uid).eq('account_type', 'credit_card'),
  ])

  // A card bill counts only when that month's card purchases weren't imported
  const cardIds = new Set((cardsRes.data ?? []).map((c: any) => c.id))
  return <AnalysisClient transactions={markUnitemisedCardBills(txns, cardIds)} budgets={budgetsRes.data ?? []} />
}
