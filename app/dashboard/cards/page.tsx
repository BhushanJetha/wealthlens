import { createClient } from '@/lib/supabase/server'
import CardsClient from '@/components/dashboard/CardsClient'

export default async function CardsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', uid).eq('account_type', 'credit_card').eq('is_active', true)
  const cards = accounts ?? []

  // Six months of charges on these cards, for the spending bars
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 5)
  const ids = cards.map(c => c.id)
  const { data: txns } = ids.length
    ? await supabase.from('transactions').select('account_id,amount,currency,txn_date,txn_type,category')
        .eq('user_id', uid).in('account_id', ids).gte('txn_date', `${from.toISOString().slice(0, 7)}-01`).limit(5000)
    : { data: [] }

  return <CardsClient cards={cards} txns={txns ?? []} />
}
