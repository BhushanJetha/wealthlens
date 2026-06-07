import { normMerchant } from '@/lib/categoryMemory'

// Finds duplicate transactions (same date + amount + merchant, ignoring any
// leading date that used to be kept in the merchant name) and deletes all but
// one per group — keeping the most recently created row (the clean copy).
// Returns the number of rows removed.
export async function removeDuplicateTransactions(supabase: any, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, txn_date, amount, merchant, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })   // newest first → newest is kept
    .limit(20000)

  if (error || !Array.isArray(data)) return 0

  const seen = new Set<string>()
  const toDelete: string[] = []
  for (const t of data) {
    const key = `${t.txn_date}|${Math.round(Number(t.amount) * 100)}|${normMerchant(t.merchant)}`
    if (seen.has(key)) toDelete.push(t.id)   // a newer copy was already kept
    else seen.add(key)
  }

  if (toDelete.length === 0) return 0

  // Delete in chunks to stay well within URL/statement limits
  let removed = 0
  for (let i = 0; i < toDelete.length; i += 200) {
    const chunk = toDelete.slice(i, i + 200)
    const { error: delErr } = await supabase.from('transactions').delete().in('id', chunk)
    if (!delErr) removed += chunk.length
  }
  return removed
}
