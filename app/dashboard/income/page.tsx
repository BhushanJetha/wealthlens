import { createClient } from '@/lib/supabase/server'
import IncomeClient from '@/components/dashboard/IncomeClient'

export default async function IncomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [txnsRes, accsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user!.id).eq('txn_type', 'income').order('txn_date', { ascending: false }).limit(500),
    supabase.from('accounts').select('id,name,bank_name').eq('user_id', user!.id),
  ])

  return <IncomeClient transactions={txnsRes.data ?? []} accounts={accsRes.data ?? []} />
}
