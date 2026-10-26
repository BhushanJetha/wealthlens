import { createClient } from '@/lib/supabase/server'
import ExpensesClient from '@/components/dashboard/ExpensesClient'
import { markUnitemisedCardBills } from '@/lib/money'

export default async function ExpensesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user!.id).in('txn_type', ['expense','transfer','loan']).order('txn_date', { ascending: false }).limit(5000),
    supabase.from('accounts').select('id,name,bank_name,account_type').eq('user_id', user!.id),
  ])

  // A card bill counts only when that month's card purchases weren't imported
  const cardIds = new Set((accsRes.data ?? []).filter(a => a.account_type === 'credit_card').map(a => a.id))
  return <ExpensesClient transactions={markUnitemisedCardBills(txnsRes.data ?? [], cardIds)} accounts={accsRes.data ?? []} />
}
