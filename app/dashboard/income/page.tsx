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
      .eq('user_id', user!.id).eq('txn_type', 'transfer')
      .order('txn_date', { ascending: false }).limit(500),
  ])

  // Transfers are passed so the page can pair UAE → India remittances into
  // "Received from UAE" India income (lib/money); they're never income themselves

  return (
    <IncomeClient
      transactions={txnsRes.data ?? []}
      accounts={accsRes.data ?? []}
      transfers={transfersRes.data ?? []}
    />
  )
}
