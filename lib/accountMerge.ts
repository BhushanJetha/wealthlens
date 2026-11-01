// The same real account on file twice — usually one was deleted (deleting
// only closes it) and then added again, so its older history sits on the
// closed record and every report shows the account twice. Merging moves
// everything onto the one you keep and removes the other.
import { kindOf } from './ledger'
import { isMissingTable } from './supabase/missingTable'

const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Same currency and kind, and the same last 4 digits (when both have them)
// or else the same name
export function sameAccount(a: any, b: any): boolean {
  if (!a || !b || a.id === b.id) return false
  if ((a.currency ?? 'INR') !== (b.currency ?? 'INR') || kindOf(a) !== kindOf(b)) return false
  if (a.last_four && b.last_four) return String(a.last_four) === String(b.last_four)
  return !!norm(a.name) && norm(a.name) === norm(b.name)
}

// Which to keep: the open one, then the one whose balance was saved last, then the older record
const keepFirst = (a: any, b: any) =>
  Number(b.is_active !== false) - Number(a.is_active !== false)
  || String(b.balance_as_of ?? '').localeCompare(String(a.balance_as_of ?? ''))
  || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))

export function duplicateAccounts(accounts: any[]): { keep: any; dupes: any[] }[] {
  const used = new Set<string>(), out: { keep: any; dupes: any[] }[] = []
  for (const a of accounts) {
    if (used.has(a.id)) continue
    const group = [a, ...accounts.filter(b => !used.has(b.id) && sameAccount(a, b))]
    if (group.length < 2) continue
    group.forEach(g => used.add(g.id))
    group.sort(keepFirst)
    out.push({ keep: group[0], dupes: group.slice(1) })
  }
  return out
}

// Rows on the record being removed that are already on the one kept — same
// day, amount, kind and currency (the same statement imported into both)
export function exactCopies(keepTxns: any[], dupeTxns: any[]): string[] {
  const key = (t: any) => `${String(t.txn_date).slice(0, 10)}|${Math.round((Number(t.amount) || 0) * 100)}|${t.txn_type}|${t.currency}`
  const pool = new Map<string, number>()
  for (const t of keepTxns) pool.set(key(t), (pool.get(key(t)) ?? 0) + 1)
  const out: string[] = []
  for (const t of dupeTxns) {
    const k = key(t), n = pool.get(k) ?? 0
    if (n > 0) { out.push(t.id); pool.set(k, n - 1) }
  }
  return out
}

// Every place that points at an account: [table, column]
const LINKS: [string, string][] = [
  ['transactions', 'account_id'], ['transactions', 'counter_account_id'],
  ['recurring_txns', 'account_id'], ['recurring_txns', 'counter_account_id'],
  ['txn_rules', 'set_account_id'], ['home_loans', 'pay_from_account_id'], ['accounts', 'pay_from_account_id'],
  ['mutual_funds', 'sip_account_id'], ['goals', 'account_id'], ['vault_items', 'account_id'],
]
// A table or column whose migration hasn't been run: nothing there to move
const skippable = (e: any) => isMissingTable(e) || e?.code === 'PGRST204' || e?.code === '42703'

// Moves everything from `dupe` onto `keep`, leaves out `dropIds` (copies), and
// removes `dupe`. Returns an error message, or null when it worked.
export async function mergeAccounts(sb: any, keep: any, dupe: any, dropIds: string[] = []): Promise<string | null> {
  for (let i = 0; i < dropIds.length; i += 200) {
    const { error } = await sb.from('transactions').delete().in('id', dropIds.slice(i, i + 200))
    if (error) return error.message
  }
  for (const [table, col] of LINKS) {
    const { error } = await sb.from(table).update({ [col]: keep.id }).eq(col, dupe.id)
    if (error && !skippable(error)) return error.message
  }
  // A move between the two records is now inside one account — not a move any more
  await sb.from('transactions').update({ counter_account_id: null }).eq('account_id', keep.id).eq('counter_account_id', keep.id)
  // Saved bank details: one per account — moved over only when the kept one has none
  const { data: det, error: detErr } = await sb.from('account_details').select('account_id').in('account_id', [keep.id, dupe.id])
  if (!detErr && det?.some((d: any) => d.account_id === dupe.id) && !det.some((d: any) => d.account_id === keep.id))
    await sb.from('account_details').update({ account_id: keep.id }).eq('account_id', dupe.id)
  if (keep.is_active === false && dupe.is_active !== false) await sb.from('accounts').update({ is_active: true }).eq('id', keep.id)
  const { error } = await sb.from('accounts').delete().eq('id', dupe.id)
  if (error) {
    // Nothing points at it any more; if it can't be removed, at least close it
    const { error: e2 } = await sb.from('accounts').update({ is_active: false }).eq('id', dupe.id)
    if (e2) return e2.message
  }
  return null
}
