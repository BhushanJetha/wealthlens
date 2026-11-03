// Changing many transactions at once: what each change does to each row. A row
// the change can't apply to is skipped and counted, never forced.
export type CatKind = 'expense' | 'income'
const LOAN_CATS = new Set(['EMI/Loan', 'Loan on Card'])

// A spending category on spending rows, an income category on income rows. A
// transfer or loan given a spending category becomes that spending (a SIP saved
// as a transfer, say) and stops being a move between your accounts.
export function categoryPatch(t: any, category: string, kind: CatKind): Record<string, any> | null {
  if (!category || t.category === category && (kind === 'income' || t.txn_type === 'expense')) return null
  if (kind === 'income') return t.txn_type === 'income' ? { category, sub_category: null } : null
  if (t.txn_type === 'income') return null
  const keepLoan = t.txn_type === 'loan' && LOAN_CATS.has(category)
  const patch: Record<string, any> = { category, sub_category: null, txn_type: keepLoan ? 'loan' : 'expense' }
  if (t.txn_type === 'transfer') patch.counter_account_id = null
  return patch
}

// An account in the same currency (an AED amount can't sit in a rupee account)
export function accountPatch(t: any, account: { id: string; currency: string } | null): Record<string, any> | null {
  if (!account || t.account_id === account.id || t.currency !== account.currency || t.paid_by_friend_id) return null
  return { account_id: account.id }
}

// Rows with the same patch go in one write
export function groupPatches(rows: any[], patchOf: (t: any) => Record<string, any> | null) {
  const groups = new Map<string, { patch: Record<string, any>; ids: string[] }>()
  let skipped = 0
  for (const t of rows) {
    const p = patchOf(t)
    if (!p) { skipped++; continue }
    const k = JSON.stringify(p)
    const g = groups.get(k) ?? groups.set(k, { patch: p, ids: [] }).get(k)!
    g.ids.push(t.id)
  }
  return { groups: Array.from(groups.values()), skipped }
}

// What the selection is: one currency? only spending, only income, or both?
export function selectionKinds(rows: any[]) {
  const income = rows.filter(t => t.txn_type === 'income').length
  return { income, spending: rows.length - income, currencies: Array.from(new Set(rows.map(t => t.currency))) }
}
