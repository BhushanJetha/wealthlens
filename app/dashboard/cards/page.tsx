import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import CardsClient from '@/components/dashboard/CardsClient'

export default async function CardsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // Live outstanding: statement balance + card spends − payments since (lib/ledger)
  const { rate } = await getAedInr()
  const { data: all } = await activeAccountsWithLedger(supabase, uid, rate)
  const cards = (all ?? []).filter(a => a.account_type === 'credit_card')

  // Six months of charges on these cards, for the spending bars
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 5)
  const ids = cards.map(c => c.id)
  const { data: txns } = ids.length
    ? await fetchAll((a, b) => supabase.from('transactions').select('account_id,amount,currency,txn_date,txn_type,category')
        .eq('user_id', uid).in('account_id', ids).gte('txn_date', `${from.toISOString().slice(0, 7)}-01`).order('txn_date').order('id').range(a, b))
    : { data: [] }

  // Saved card details (migration 025); a missing table just means none yet
  const { data: details } = ids.length
    ? await supabase.from('account_details').select('*').in('account_id', ids)
    : { data: [] }

  return <CardsClient cards={cards} txns={txns ?? []} details={details ?? []} />
}
