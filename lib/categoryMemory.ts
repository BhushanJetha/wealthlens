// Smart categorization memory.
// Learns from the user's already-saved transactions: for each merchant (split by
// money direction in/out so an Amazon *refund* and an Amazon *purchase* are kept
// apart) it remembers the category they most often chose, then auto-applies it to
// matching merchants in a freshly-parsed statement.

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 28)
const dirOf = (txnType: string) => (txnType === 'income' ? 'in' : 'out')

export interface CategoryMemory {
  has: boolean
  // Mutates the txn's category/txn_type in place when the merchant is recognised.
  // Returns true if a learned category was applied.
  apply: (t: { merchant: string; category: string; txn_type: string }) => boolean
}

export async function buildCategoryMemory(supabase: any, userId: string): Promise<CategoryMemory> {
  let data: any[] = []
  try {
    const res = await supabase
      .from('transactions')
      .select('merchant, category, txn_type')
      .eq('user_id', userId)
      .not('category', 'is', null)
      .order('txn_date', { ascending: false })
      .limit(4000)
    data = res.data ?? []
  } catch { data = [] }

  // key = `${normalizedMerchant}|${direction}` → { category → count }
  const counts: Record<string, Record<string, number>> = {}
  const typeOf: Record<string, string> = {}   // `${key}|${category}` → txn_type
  for (const h of data) {
    const k = norm(h.merchant)
    if (!k || !h.category) continue
    const key = `${k}|${dirOf(h.txn_type)}`
    ;(counts[key] ||= {})[h.category] = (counts[key]?.[h.category] ?? 0) + 1
    typeOf[`${key}|${h.category}`] = h.txn_type
  }

  const learned: Record<string, { category: string; txn_type: string }> = {}
  for (const [key, cats] of Object.entries(counts)) {
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]
    if (top) learned[key] = { category: top[0], txn_type: typeOf[`${key}|${top[0]}`] ?? '' }
  }

  return {
    has: Object.keys(learned).length > 0,
    apply(t) {
      const hit = learned[`${norm(t.merchant)}|${dirOf(t.txn_type)}`]
      if (hit?.category) {
        t.category = hit.category
        if (hit.txn_type) t.txn_type = hit.txn_type
        return true
      }
      return false
    },
  }
}
