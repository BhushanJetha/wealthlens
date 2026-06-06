import { createClient } from '@/lib/supabase/server'
import TransfersClient from '@/components/dashboard/TransfersClient'

export default async function TransfersPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*, accounts(name, bank_name, account_type, currency, country)')
    .eq('user_id', user!.id)
    .eq('txn_type', 'transfer')
    .order('txn_date', { ascending: false })
    .limit(1000)

  return <TransfersClient transactions={transactions ?? []} />
}
