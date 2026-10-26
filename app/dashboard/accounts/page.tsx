import { createClient } from '@/lib/supabase/server'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import BankAccountsClient from '@/components/dashboard/BankAccountsClient'

export default async function BankAccountsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Live balances: starting balance + transactions since (lib/ledger). All
  // accounts go in, since moves (card bills, ATM, NRE → NRO) touch two of them.
  const { rate } = await getAedInr()
  const { data: all } = await activeAccountsWithLedger(supabase, user!.id, rate)
  const accounts = (all ?? []).filter(a => a.account_type !== 'credit_card')
  // Saved bank details (migration 025); a missing table just means none yet
  const ids = (accounts ?? []).map(a => a.id)
  const { data: details } = ids.length
    ? await supabase.from('account_details').select('*').in('account_id', ids)
    : { data: [] }
  return <BankAccountsClient accounts={accounts ?? []} details={details ?? []} />
}
