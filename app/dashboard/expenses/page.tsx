import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import ExpensesClient from '@/components/dashboard/ExpensesClient'
import { markUnitemisedCardBills } from '@/lib/money'

export default async function ExpensesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('*').eq('user_id', user!.id).in('txn_type', ['expense','transfer','loan']).order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('accounts').select('id,name,bank_name,account_type').eq('user_id', user!.id),
  ])

  // A card bill counts only when that month's card purchases weren't imported
  const cardIds = new Set((accsRes.data ?? []).filter(a => a.account_type === 'credit_card').map(a => a.id))
  return <ExpensesClient transactions={markUnitemisedCardBills(txnsRes.data ?? [], cardIds)} accounts={accsRes.data ?? []} />
}
