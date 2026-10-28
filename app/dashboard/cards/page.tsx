import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import CardsClient from '@/components/dashboard/CardsClient'
import { activeLoansWithEmi } from '@/lib/loans'

export default async function CardsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 5)
  const cardIds = Promise.resolve(supabase.from('accounts').select('id').eq('user_id', uid).eq('account_type', 'credit_card').eq('is_active', true))
    .then(({ data }) => (data ?? []).map(c => c.id as string))
  // All read together (each read is a round trip, ~450 ms from UAE/India)
  const [{ data: all }, { data: loans }, { data: txns }, { data: details }] = await Promise.all([
    // Live outstanding: statement balance + card spends − payments since (lib/ledger)
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
    // Loans on these cards (live outstanding — it blocks that much of the limit)
    activeLoansWithEmi(supabase, uid, q => q.eq('loan_type', 'loan_on_card')),
    // Six months of charges on these cards, for the spending bars
    cardIds.then(async (ids): Promise<{ data: any[] | null }> => ids.length
      ? fetchAll((a, b) => supabase.from('transactions').select('account_id,amount,currency,txn_date,txn_type,category')
          .eq('user_id', uid).in('account_id', ids).gte('txn_date', `${from.toISOString().slice(0, 7)}-01`).order('txn_date').order('id').range(a, b))
      : { data: [] }),
    // Saved card details (migration 025); a missing table just means none yet
    cardIds.then(async (ids): Promise<{ data: any[] | null }> => ids.length ? await supabase.from('account_details').select('*').in('account_id', ids) : { data: [] }),
  ])
  const cards = (all ?? []).filter(a => a.account_type === 'credit_card')
  const banks = (all ?? []).filter(a => a.account_type !== 'credit_card')

  return <CardsClient cards={cards} txns={txns ?? []} details={details ?? []} loans={loans ?? []} banks={banks} />
}
