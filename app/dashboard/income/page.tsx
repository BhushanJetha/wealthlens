import { createClient } from '@/lib/supabase/server'
import IncomeClient from '@/components/dashboard/IncomeClient'

export default async function IncomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes, transfersRes] = await Promise.all([
    supabase.from('transactions').select('*')
      .eq('user_id', user!.id).eq('txn_type', 'income')
      .order('txn_date', { ascending: false }).limit(500),
    supabase.from('accounts').select('id,name,bank_name').eq('user_id', user!.id),
    supabase.from('transactions').select('*')
      .eq('user_id', user!.id).eq('txn_type', 'transfer').eq('sub_category', 'International')
      .order('txn_date', { ascending: false }).limit(200),
  ])

  return (
    <IncomeClient
      transactions={txnsRes.data ?? []}
      accounts={accsRes.data ?? []}
      transfers={transfersRes.data ?? []}
    />
  )
}
