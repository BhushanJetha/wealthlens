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
  // Saved bank details (migration 025); a missing table just means none yet
  const ids = (accounts ?? []).map(a => a.id)
  const { data: details } = ids.length
    ? await supabase.from('account_details').select('*').in('account_id', ids)
    : { data: [] }
  return <BankAccountsClient accounts={accounts ?? []} details={details ?? []} />
}
