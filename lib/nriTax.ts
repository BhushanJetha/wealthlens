// NRI money in India, for tax and the repatriation limit:
//  • interest credited in a financial year on NRE (tax-free for an NRI) and
//    NRO (taxed) accounts, and the TDS your bank took (debits that say TDS)
//  • what left your NRO accounts for abroad or for NRE in a financial year,
//    against the USD 1 million a year you may send out of NRO
import { nriKindOf } from './ledger'
import { catOf } from './money'

const fyRange = (fy: string) => { const s = Number(fy.slice(3, 7)); return { start: `${s}-04-01`, end: `${s + 1}-03-31` } }
const inFy = (d: string, fy: string) => { const r = fyRange(fy); return d >= r.start && d <= r.end }
const TDS = /\btds\b|tax deducted/i

export function nriInterest(accounts: any[], txns: any[], fy: string) {
  const kind = new Map(accounts.map(a => [a.id, nriKindOf(a)]))
  const out = { nre: 0, nro: 0, other: 0, tds: 0, tdsFound: false }
  for (const t of txns) {
    if (t.currency !== 'INR' || !inFy(String(t.txn_date).slice(0, 10), fy) || !kind.has(t.account_id)) continue
    const k = kind.get(t.account_id), amt = Number(t.amount) || 0
    if (t.txn_type === 'income' && /interest/i.test(String(t.category ?? ''))) {
      if (k === 'nre' || k === 'fcnr') out.nre += amt; else if (k === 'nro') out.nro += amt; else out.other += amt
    } else if (t.txn_type !== 'income' && k === 'nro' && TDS.test(`${t.merchant ?? ''} ${t.description ?? ''} ${t.category ?? ''}`)) {
      out.tds += amt; out.tdsFound = true
    }
  }
  return out
}

// Money that left NRO: to NRE, or abroad (an AED account, or a remittance)
export const USD_LIMIT = 1_000_000
export const AED_PER_USD = 3.6725              // the dirham's fixed peg
const OUT_CATS = new Set(['NRO to NRE', 'International Transfer', 'Remittance', 'Transfer to UAE'])
export function nroSentOut(accounts: any[], txns: any[], fy: string, aedInr: number) {
  const nro = new Set(accounts.filter(a => nriKindOf(a) === 'nro').map(a => a.id))
  const rows = txns.filter(t => nro.has(t.account_id) && t.currency === 'INR' && t.txn_type !== 'income' && inFy(String(t.txn_date).slice(0, 10), fy)
    && (OUT_CATS.has(catOf(t)) || /\bto nre\b|nro\s*(to|→)\s*nre|swift|outward remit/i.test(`${t.merchant ?? ''} ${t.description ?? ''}`)))
  const inr = rows.reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const usd = aedInr > 0 ? inr / aedInr / AED_PER_USD : 0
  return { inr, usd, rows, pct: Math.min(100, usd / USD_LIMIT * 100) }
}
