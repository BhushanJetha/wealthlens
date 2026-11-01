import { createClient, getSessionUser } from '@/lib/supabase/server'
import FriendsClient from '@/components/dashboard/FriendsClient'

// Friends & splits: what friends owe you and what you owe them (lib/friends).
// Until migration 036 is run the tables don't exist, and the page says so.
export default async function FriendsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const since = new Date(); since.setUTCDate(since.getUTCDate() - 150)

  const [fr, sp, tx, recent, accs] = await Promise.all([
    supabase.from('friends').select('id,name,created_at').eq('user_id', uid).order('name'),
    supabase.from('txn_splits').select('id,friend_id,amount,transaction_id,transactions(id,txn_date,merchant,category,amount,currency,account_id)').eq('user_id', uid),
    supabase.from('transactions').select('*').eq('user_id', uid).or('paid_by_friend_id.not.is.null,friend_id.not.is.null'),
    // Money that could be a friend paying you back, or you paying them
    supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', since.toISOString().slice(0, 10))
      .in('txn_type', ['income', 'transfer']).order('txn_date', { ascending: false }).limit(1000),
    supabase.from('accounts').select('id,name,bank_name,currency,account_type,is_active').eq('user_id', uid).eq('is_active', true),
  ])

  return (
    <FriendsClient ready={!fr.error && !sp.error && !tx.error}
      friends={fr.data ?? []} splits={sp.data ?? []} transactions={tx.data ?? []}
      recent={recent.data ?? []} accounts={accs.data ?? []} />
  )
}
