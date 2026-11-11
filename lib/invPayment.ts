// Fixing one recorded fund or share payment (an investment_transactions row):
// its amount, date, units or price, whether it was a SIP, or which fund /
// share it went into — or deleting it. The holding's units and cost follow,
// and so does the bank payment it came from (transactions.link_ref or
// auto_ref with this row's inv_txn_id), so every screen keeps agreeing.
import { sipForPayment, claimSip, unclaimSip } from './sips'
import { holdingName, type HType } from './holding'

export type PayType = 'mutual_funds' | 'stocks'
export const isSale = (t: any) => t?.txn_type === 'redemption' || t?.txn_type === 'switch_out'

// The holding after `dUnits` more units costing `dCost` more (both may be negative)
export function holdingPatch(type: PayType, h: any, dUnits: number, dCost: number): Record<string, number> {
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6, r2 = (n: number) => Math.round(n * 100) / 100, r4 = (n: number) => Math.round(n * 1e4) / 1e4
  if (type === 'mutual_funds') {
    const units = Math.max(0, (Number(h.units) || 0) + dUnits)
    const was = Number(h.invested_amount) || (Number(h.units) || 0) * (Number(h.avg_nav) || 0)
    const invested = Math.max(0, was + dCost)
    return { units: r6(units), invested_amount: r2(invested), ...(units > 0 ? { avg_nav: r4(invested / units) } : {}) }
  }
  const q = Number(h.quantity) || 0, avg = Number(h.avg_buy_price) || 0, nq = Math.max(0, q + dUnits)
  return { quantity: r6(nq), ...(nq > 0 ? { avg_buy_price: r4(Math.max(0, q * avg + dCost) / nq) } : {}) }
}

// What a recorded row adds to its holding: a buy its units and amount, a sale
// takes its units and what they cost (an old sale with no cost kept: at the average price)
const avgOf = (h: any) => Number(h?.avg_nav ?? h?.avg_buy_price) || 0
const effect = (t: any, h: any) => isSale(t)
  ? { units: -(Number(t.units) || 0), cost: -(t.cost_amount != null ? Number(t.cost_amount) || 0 : (Number(t.units) || 0) * avgOf(h)) }
  : { units: Number(t.units) || 0, cost: Number(t.amount) || 0 }

// The bank payments this row was recorded from
export async function bankLinks(sb: any, txnId: string): Promise<{ row: any; col: 'link_ref' | 'auto_ref' }[]> {
  const out: { row: any; col: 'link_ref' | 'auto_ref' }[] = []
  for (const col of ['link_ref', 'auto_ref'] as const) {
    const { data } = await sb.from('transactions').select(`id,txn_date,amount,currency,merchant,account_id,${col}`).eq(`${col}->>inv_txn_id`, txnId)
    for (const row of data ?? []) out.push({ row, col })
  }
  return out
}

async function applyDelta(sb: any, type: PayType, id: string, dUnits: number, dCost: number): Promise<string | null> {
  if (Math.abs(dUnits) < 1e-9 && Math.abs(dCost) < 0.005) return null
  const { data: h, error } = await sb.from(type).select('*').eq('id', id).maybeSingle()
  if (error || !h) return error?.message ?? 'That holding is gone.'
  const res = await sb.from(type).update(holdingPatch(type, h, dUnits, dCost)).eq('id', id)
  return res.error?.message ?? null
}

export interface PaymentEdit {
  holding: any                 // the fund / share it goes into (the same one, or another)
  txn_type: string             // 'sip' | 'purchase' (a sale keeps its own)
  date: string; amount: number; units: number; nav: number
  estimated?: boolean          // still estimated (a fund's units, not yet confirmed)
  syncBank: boolean            // change the bank payment's amount and date to match
}

export async function editPayment(sb: any, type: PayType, txn: any, from: any, next: PaymentEdit): Promise<string | null> {
  const sale = isSale(txn), moved = !sale && next.holding.id !== from.id
  if (!(next.amount > 0) || !(next.units > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(next.date)) return 'Enter the date, amount and units.'
  // A sale's cost moves with the units sold (first in, first out kept the cost per unit)
  const oldU = Number(txn.units) || 0
  const cost = sale && txn.cost_amount != null && oldU > 0 ? Math.round(Number(txn.cost_amount) / oldU * next.units * 100) / 100 : txn.cost_amount
  const after = { ...txn, txn_type: sale ? txn.txn_type : next.txn_type, amount: next.amount, units: next.units, nav: next.nav, cost_amount: cost }
  const was = effect(txn, from), now = effect(after, from)

  const upd: Record<string, any> = { txn_date: next.date, amount: next.amount, units: next.units, nav: next.nav }
  if (!sale) upd.txn_type = next.txn_type
  if (sale && cost != null) upd.cost_amount = cost
  if ('estimated' in txn && next.estimated != null) upd.estimated = next.estimated
  if (moved) Object.assign(upd, { asset_id: next.holding.id, asset_name: type === 'stocks' ? (next.holding.symbol ?? holdingName(type, next.holding)) : holdingName(type, next.holding), folio_number: next.holding.folio_number ?? null })
  const { error } = await sb.from('investment_transactions').update(upd).eq('id', txn.id)
  if (error) return error.message

  const err = moved
    ? (await applyDelta(sb, type, from.id, -was.units, -was.cost)) ?? (await applyDelta(sb, type, next.holding.id, now.units, now.cost))
    : await applyDelta(sb, type, from.id, now.units - was.units, now.cost - was.cost)
  if (err) return err

  for (const { row, col } of await bankLinks(sb, txn.id)) {
    let ref = { ...row[col], units: next.units, nav: next.nav, ...(col === 'auto_ref' ? { amount: next.amount } : {}) }
    if (moved) {
      ref = { ...ref, id: next.holding.id, name: holdingName(type, next.holding) }
      // A linked SIP gives its month back to the old fund and takes it on the new one
      // (an automatic entry keeps its month ticked off, so it isn't added again)
      if (col === 'link_ref' && type === 'mutual_funds' && ref.month && ref.sip_id) {
        const { data: old } = await sb.from('mutual_funds').select('*').eq('id', from.id).maybeSingle()
        if (old) await unclaimSip(sb, old, ref.sip_id, ref.month, ref.prev_month ?? null)
        const month = next.date.slice(0, 7), sip = sipForPayment(next.holding, next.amount, month)
        if (sip && !(sip.last_month && sip.last_month >= month) && await claimSip(sb, next.holding, sip.id, month)) ref = { ...ref, month, prev_month: sip.last_month ?? null, sip_id: sip.id }
        else { delete ref.month; delete ref.prev_month; delete ref.sip_id }
      } else if (col === 'auto_ref' && type === 'mutual_funds') ref = { ...ref, sip_id: sipForPayment(next.holding, next.amount, next.date.slice(0, 7))?.id ?? null }
    }
    const res = await sb.from('transactions').update({ [col]: ref, ...(next.syncBank ? { amount: next.amount, txn_date: next.date } : {}) }).eq('id', row.id)
    if (res.error) return `Saved, but the bank payment didn’t follow: ${res.error.message}`
  }
  return null
}

// Delete the row and take back what it did. The bank payment is deleted too,
// or kept as a plain payment not tied to any investment.
export async function deletePayment(sb: any, type: PayType, txn: any, holding: any, bank: 'keep' | 'delete'): Promise<string | null> {
  const links = await bankLinks(sb, txn.id)
  const { error } = await sb.from('investment_transactions').delete().eq('id', txn.id)
  if (error) return error.message
  const e = effect(txn, holding)
  const err = await applyDelta(sb, type, holding.id, -e.units, -e.cost)
  if (err) return err
  for (const { row, col } of links) {
    const ref = row[col] ?? {}
    // A linked SIP's month shows as not paid again (an automatic entry's month stays ticked off)
    if (col === 'link_ref' && type === 'mutual_funds' && ref.month && ref.sip_id) {
      const { data: f } = await sb.from('mutual_funds').select('*').eq('id', holding.id).maybeSingle()
      if (f) await unclaimSip(sb, f, ref.sip_id, ref.month, ref.prev_month ?? null)
    }
    const res = bank === 'delete'
      ? await sb.from('transactions').delete().eq('id', row.id)
      : await sb.from('transactions').update(col === 'auto_ref' ? { auto_ref: null, auto_status: null } : { link_ref: null }).eq('id', row.id)
    if (res.error) return `Deleted, but the bank payment couldn’t be ${bank === 'delete' ? 'deleted' : 'unlinked'}: ${res.error.message}`
  }
  return null
}
