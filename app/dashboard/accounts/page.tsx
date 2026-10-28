import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import BankAccountsClient from '@/components/dashboard/BankAccountsClient'

export default async function BankAccountsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  // Live balances: starting balance + transactions since (lib/ledger). All
  // accounts go in, since moves (card bills, ATM, NRE → NRO) touch two of them.
  // Saved bank details (migration 025) are read alongside; a missing table just means none yet
  const [{ data: all }, { data: saved }] = await Promise.all([
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, user!.id, rate)),
    supabase.from('account_details').select('*').eq('user_id', user!.id),
  ])
  const accounts = (all ?? []).filter(a => a.account_type !== 'credit_card')
  const ids = new Set(accounts.map(a => a.id))
  const details = (saved ?? []).filter((d: any) => ids.has(d.account_id))
  return <BankAccountsClient accounts={accounts} details={details} />
}
