// Review inbox (Money › Review): transactions that make the numbers less
// accurate until someone looks at them — no "Paid from", a vague category,
// a likely duplicate, money sent home whose ₹ credit never showed up, a
// transfer of unknown kind (counted as money sent until it's sorted), or an
// amount in a different currency from its account.
// Same-merchant items are grouped so one tap fixes them all.
import { normMerchant } from './categoryMemory'
import { ruleTextFor } from './rules'
import { catOf, isSpend, pairRemittances, pairOwnTransfers, isUnknownTransfer, CC_BILL, MOVEMENT_CATS } from './money'
import { daysBetween, addDaysTo } from './insights'

export type ReviewKind = 'account' | 'category' | 'duplicate' | 'remit' | 'transfer' | 'currency'
export interface ReviewItem {
  id: string; kind: ReviewKind; date: string
  txns: any[]                 // account / category: every match in the group (newest first); duplicate: [copy, keep]; remit: [sent]
  key?: string                // rule text for the group's merchant
  suggestAccount?: string | null
  suggestCategory?: string | null
  estimate?: number           // remit / currency (AED): ₹ at today's rate
  currency?: 'AED' | 'INR'    // currency: the account's currency
}

export const REVIEW_DAYS = 90
export const isVagueCategory = (c: any) => !c || /^(other|uncategori[sz]ed)$/i.test(String(c).trim())

export function findReviewItems(txns: any[], opts: { today: string; fx: number; accounts?: any[] }): ReviewItem[] {
  const { today, fx } = opts
  const since = addDaysTo(today, -REVIEW_DAYS)
  const real = txns.filter(t => !t._remit && t.txn_date)
  const open = real.filter(t => t.txn_date >= since && t.txn_date <= today && !t.reviewed_at)

  // What each merchant usually gets, from everything on file (keyed like a
  // rule, so "CARREFOUR MOE 22" learns from "Carrefour City")
  const accBy: Record<string, Record<string, number>> = {}, catBy: Record<string, Record<string, number>> = {}
  for (const t of real) {
    const k = ruleTextFor(t.merchant)
    if (!k) continue
    if (t.account_id) (accBy[k] ||= {})[t.account_id] = (accBy[k][t.account_id] ?? 0) + 1
    if (t.txn_type === 'expense' && !isVagueCategory(t.category)) (catBy[k] ||= {})[t.category] = (catBy[k][t.category] ?? 0) + 1
  }
  const top = (m?: Record<string, number>) => (m ? Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] : null) ?? null

  const items: ReviewItem[] = []
  const inDup = new Set<string>()

  // An amount in another currency than its account (any date): an account is
  // one currency, so it was relabelled — e.g. ₹40,000 marked UAE → India
  // became AED 40,000, about ₹9 lakh everywhere
  const accCur = new Map((opts.accounts ?? []).map(a => [a.id, a.currency]))
  const wrongCur = new Set<any>()
  for (const t of real) {
    const c = accCur.get(t.account_id)
    if ((c !== 'AED' && c !== 'INR') || t.currency === c || t.reviewed_at) continue
    wrongCur.add(t)
    items.push({ id: `cur-${t.id}`, kind: 'currency', date: t.txn_date, txns: [t], currency: c,
      ...(t.currency === 'AED' ? { estimate: Math.round((Number(t.amount) || 0) * fx) } : {}) })
  }

  // Likely duplicates: same amount and currency within a day, same kind, a
  // similar merchant, and not two accounts' sides of one move
  const groups: Record<string, any[]> = {}
  for (const t of open) {
    const c = catOf(t)
    if (c === CC_BILL || MOVEMENT_CATS.has(c)) continue
    ;(groups[`${t.currency}|${Math.round(Number(t.amount) * 100)}|${t.txn_type}`] ||= []).push(t)
  }
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue
    g.sort((a, b) => a.txn_date.localeCompare(b.txn_date))
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j]
      if (inDup.has(a.id) || inDup.has(b.id) || daysBetween(a.txn_date, b.txn_date) > 1) continue
      const ka = normMerchant(a.merchant), kb = normMerchant(b.merchant)
      const similar = ka === kb || (ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka)))
      const sameAcc = a.account_id === b.account_id || !a.account_id || !b.account_id
      if (!similar || !sameAcc) continue
      // Keep the fuller record; the copy is the one with less filled in, else the newer
      const score = (t: any) => (t.account_id ? 2 : 0) + (isVagueCategory(t.category) ? 0 : 1)
      const [copy, keep] = score(a) !== score(b) ? (score(a) < score(b) ? [a, b] : [b, a])
        : String(a.created_at ?? '') > String(b.created_at ?? '') ? [a, b] : [b, a]
      items.push({ id: `dup-${keep.id}-${copy.id}`, kind: 'duplicate', date: keep.txn_date, txns: [copy, keep] })
      inDup.add(a.id); inDup.add(b.id)
    }
  }

  // Money sent home with no ₹ credit found (after 3 days) — counted at an estimate
  for (const r of pairRemittances(real, fx)) {
    if (r.source !== 'estimated' || !r.out || !r.sentOn || r.sentOn < since || r.out.reviewed_at || wrongCur.has(r.out)) continue
    if (daysBetween(r.sentOn, today) < 3) continue
    items.push({ id: `remit-${r.out.id}`, kind: 'remit', date: r.sentOn, txns: [r.out], estimate: r.inr })
  }

  // No "Paid from" / vague category, grouped by merchant
  const byKey = (kind: 'account' | 'category' | 'transfer', rows: any[]) => {
    const m: Record<string, any[]> = {}
    for (const t of rows) (m[ruleTextFor(t.merchant) || `id-${t.id}`] ||= []).push(t)
    for (const [key, ts] of Object.entries(m)) {
      ts.sort((a, b) => b.txn_date.localeCompare(a.txn_date))
      const k = ruleTextFor(ts[0].merchant)
      items.push({
        id: `${kind}-${key}`, kind, key, date: ts[0].txn_date, txns: ts,
        suggestAccount: kind === 'account' ? top(accBy[k]) : undefined,
        suggestCategory: kind === 'category' ? top(catBy[k]) : undefined,
      })
    }
  }
  const rest = open.filter(t => !inDup.has(t.id) && !wrongCur.has(t))
  byKey('account', rest.filter(t => !t.account_id && (isSpend(t) || t.txn_type === 'income')))
  byKey('category', rest.filter(t => t.txn_type === 'expense' && isVagueCategory(t.category)))
  // Transfers of unknown kind that aren't one side of a move between your own accounts
  const own = new Set(pairOwnTransfers(real).map(p => p.out))
  byKey('transfer', rest.filter(t => isUnknownTransfer(t) && !own.has(t)))

  return items.sort((a, b) => b.date.localeCompare(a.date))
}

// How many transactions the inbox covers (for badges)
export const reviewCount = (items: ReviewItem[]) => items.reduce((s, i) => s + (i.kind === 'duplicate' ? 1 : i.txns.length), 0)
