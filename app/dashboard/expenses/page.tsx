import { createClient } from '@/lib/supabase/server'
import ExpensesClient from '@/components/dashboard/ExpensesClient'

export default async function ExpensesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user!.id).eq('txn_type', 'expense').order('txn_date', { ascending: false }).limit(500),
    supabase.from('accounts').select('id,name,bank_name').eq('user_id', user!.id),
  ])

  return <ExpensesClient transactions={txnsRes.data ?? []} accounts={accsRes.data ?? []} />
}
