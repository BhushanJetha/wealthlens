import { createClient } from '@/lib/supabase/server'
import BankAccountsClient from '@/components/dashboard/BankAccountsClient'

export default async function BankAccountsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .neq('account_type', 'credit_card')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  return <BankAccountsClient accounts={accounts ?? []} />
}
