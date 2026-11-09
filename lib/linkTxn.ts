// Linking a payment to what it paid for (migration 046, transactions.link_ref):
// an investment payment to the fund, share, RD… it bought, an EMI to its loan.
// The link is saved once, so nothing is guessed again, and the other side is
// recorded at the same moment — the buy (units) on a fund or share, the month
// on an RD, the EMI on a loan — so every tab agrees and the SIP / RD / EMI
// automations see the month as done (never recorded twice).
import { HTYPES, holdingName, type HType } from './holding'
import { type InvestKind } from './categories'

export type LinkType = HType | 'loan'
export interface LinkRef {
  type: LinkType; id: string; name: string
  inv_txn_id?: string        // the buy it recorded (investment_transactions)
  loan_txn_id?: string       // the EMI it recorded (loan_transactions)
  units?: number             // units / shares it added
  month?: string             // the SIP / RD / EMI month it marked done
  prev_month?: string | null // what that month marker was before
  recorded: boolean          // false: linked only (nothing changed on the other side)
}

// Which holdings an investment of this kind can be
export const TYPES_FOR: Record<InvestKind, HType[]> = {
  'Mutual funds': ['mutual_funds'], Stocks: ['stocks', 'etf_investments'], 'Fixed deposit': ['fixed_deposits'],
  'Recurring deposit': ['recurring_deposits'], Gold: ['gold_investments', 'bond_investments'], 'PPF & NPS': ['ppf_epf_accounts', 'nps_accounts'],
  'Insurance plans': ['lic_policies'], 'Other investing': ['bond_investments', 'gold_investments', 'etf_investments'],
}
// …and back: a linked payment's kind comes from what it's linked to
export const KIND_OF_TYPE: Record<HType, InvestKind> = {
  mutual_funds: 'Mutual funds', stocks: 'Stocks', etf_investments: 'Stocks', fixed_deposits: 'Fixed deposit', recurring_deposits: 'Recurring deposit',
  gold_investments: 'Gold', bond_investments: 'Gold', ppf_epf_accounts: 'PPF & NPS', nps_accounts: 'PPF & NPS', lic_policies: 'Insurance plans',
}
// What linking changes on the other side (the rest are linked only: their
// balances are kept on their own page)
export const RECORDS: Partial<Record<LinkType, string>> = {
  mutual_funds: 'adds the units to the fund', stocks: 'adds the shares', etf_investments: 'adds the units',
  recurring_deposits: 'marks this month’s instalment paid', loan: 'records this month’s EMI on the loan',
}

export interface LinkOption { type: LinkType; id: string; name: string; sub: string; currency: string; price: number; row: any }
const TABLE = (t: LinkType) => (t === 'loan' ? 'home_loans' : t)
const priceOf = (type: LinkType, r: any) => type === 'mutual_funds' ? Number(r.current_nav) || Number(r.avg_nav) || 0
  : type === 'stocks' || type === 'etf_investments' ? Number(r.current_price) || Number(r.avg_buy_price) || 0 : 0

// Your holdings of these types (or your loans), to pick from
export async function loadLinkOptions(supabase: any, userId: string, types: LinkType[]): Promise<LinkOption[]> {
  const res = await Promise.all(types.map(t => {
    let q = supabase.from(TABLE(t)).select('*').eq('user_id', userId)
    if (t === 'loan') q = q.eq('is_active', true)
    return q
  }))
  return types.flatMap((t, i) => (res[i].data ?? [])
    .filter((r: any) => r.is_active !== false && !(t === 'mutual_funds' && Number(r.units) <= 0 && !r.has_sip))
    .map((r: any) => ({
      type: t, id: r.id, row: r, currency: r.currency || 'INR', price: priceOf(t, r),
      name: t === 'loan' ? String(r.name ?? r.lender ?? 'Loan') : holdingName(t, r),
      sub: t === 'loan' ? [r.lender ?? r.bank_name, r.emi_amount ? `EMI ${Math.round(Number(r.emi_amount)).toLocaleString('en-IN')}` : null].filter(Boolean).join(' · ')
        : [HTYPES[t].label, t === 'mutual_funds' && r.has_sip && r.sip_amount ? `SIP ${Math.round(Number(r.sip_amount)).toLocaleString('en-IN')}` : null, r.symbol, r.bank_name].filter(Boolean).join(' · '),
    })))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Can this column be saved yet (migration 046)?
export async function canLink(supabase: any): Promise<boolean> {
  const { error } = await supabase.from('transactions').select('link_ref').limit(1)
  return !error
}

const near = (a: number, b: number) => b > 0 && Math.abs(a - b) <= b * 0.1
// Mark a month done only if it still isn't (another tab, or the automation, may have)
async function claim(supabase: any, table: string, col: string, r: any, month: string): Promise<boolean> {
  let q = supabase.from(table).update({ [col]: month }).eq('id', r.id)
  q = r[col] ? q.eq(col, r[col]) : q.is(col, null)
  const { data, error } = await q.select('id')
  return !error && !!data?.length
}

// Record the other side of a payment and return the link to save on it.
// `fresh`: the holding / loan was just added for this payment (its amount is
// already in it), so only the link is saved.
export async function recordLinked(supabase: any, userId: string, pay: { txn_date: string; amount: number; currency: string },
  o: LinkOption, opts: { units?: number; fresh?: boolean } = {}): Promise<{ ref: LinkRef; note?: string } | { error: string }> {
  const base: LinkRef = { type: o.type, id: o.id, name: o.name, recorded: false }
  const r = o.row, month = pay.txn_date.slice(0, 7), amount = pay.amount
  if (opts.fresh) {
    // Just added with this payment in it: nothing to add, but this month is
    // done, so the SIP / RD / EMI automation doesn't add it again
    const col = o.type === 'mutual_funds' && r.has_sip && near(amount, Number(r.sip_amount) || 0) ? 'sip_last_month'
      : o.type === 'recurring_deposits' ? 'rd_last_month' : o.type === 'loan' ? 'emi_last_month' : null
    if (col && !(r[col] && r[col] >= month)) await claim(supabase, TABLE(o.type), col, r, month)
    return { ref: base }
  }
  if (o.type === 'mutual_funds' || o.type === 'stocks' || o.type === 'etf_investments') {
    // A fund's SIP for a month that's already in (the automation or a statement): link only
    const sipLike = o.type === 'mutual_funds' && r.has_sip && near(amount, Number(r.sip_amount) || 0)
    if (sipLike && r.sip_last_month && r.sip_last_month >= month) return { ref: base, note: 'this month’s SIP was already recorded' }
    const units = opts.units && opts.units > 0 ? opts.units : o.price > 0 ? amount / o.price : 0
    if (!(units > 0)) return { error: 'Enter how many units this bought.' }
    const asset = HTYPES[o.type].asset ?? 'mutual_fund'
    const { data: it, error } = await supabase.from('investment_transactions').insert({
      user_id: userId, asset_type: asset, asset_id: r.id, asset_name: o.name, folio_number: r.folio_number ?? null,
      txn_date: pay.txn_date, txn_type: sipLike ? 'sip' : 'purchase', amount, units, nav: amount / units, currency: r.currency ?? pay.currency, source: 'linked',
    }).select('id').single()
    if (error) return { error: error.message }
    const upd = o.type === 'mutual_funds'
      ? { units: (Number(r.units) || 0) + units, invested_amount: (Number(r.invested_amount) || 0) + amount }
      : o.type === 'stocks'
        ? { quantity: (Number(r.quantity) || 0) + units, avg_buy_price: ((Number(r.quantity) || 0) * (Number(r.avg_buy_price) || 0) + amount) / ((Number(r.quantity) || 0) + units) }
        : { units: (Number(r.units) || 0) + units, avg_buy_price: ((Number(r.units) || 0) * (Number(r.avg_buy_price) || 0) + amount) / ((Number(r.units) || 0) + units) }
    await supabase.from(o.type).update(upd).eq('id', r.id)
    const ref: LinkRef = { ...base, recorded: true, inv_txn_id: it?.id, units }
    if (sipLike && (!r.sip_last_month || r.sip_last_month < month) && await claim(supabase, 'mutual_funds', 'sip_last_month', r, month)) { ref.month = month; ref.prev_month = r.sip_last_month ?? null }
    return { ref }
  }
  if (o.type === 'recurring_deposits') {
    if (r.rd_last_month && r.rd_last_month >= month) return { ref: base, note: 'this month’s instalment was already recorded' }
    if (!(await claim(supabase, 'recurring_deposits', 'rd_last_month', r, month))) return { ref: base, note: 'this month’s instalment was already recorded' }
    return { ref: { ...base, recorded: true, month, prev_month: r.rd_last_month ?? null } }
  }
  if (o.type === 'loan') {
    if (r.emi_last_month && r.emi_last_month >= month) return { ref: base, note: 'this month’s EMI was already recorded' }
    // Principal and interest are worked out from the balance (lib/loans liveOutstanding)
    const { data: lt, error } = await supabase.from('loan_transactions').insert({
      user_id: userId, loan_id: r.id, kind: 'emi', txn_date: pay.txn_date, amount, note: 'Linked from Expenses',
    }).select('id').single()
    if (error) return { error: error.message }
    const ref: LinkRef = { ...base, recorded: true, loan_txn_id: lt?.id }
    if (await claim(supabase, 'home_loans', 'emi_last_month', r, month)) { ref.month = month; ref.prev_month = r.emi_last_month ?? null }
    return { ref }
  }
  return { ref: base }      // linked only
}

// Take back what a link recorded (when its payment is deleted)
export async function undoLinked(supabase: any, ref: LinkRef | null | undefined, amount: number): Promise<void> {
  if (!ref?.recorded) return
  if (ref.inv_txn_id) {
    await supabase.from('investment_transactions').delete().eq('id', ref.inv_txn_id)
    const { data: r } = await supabase.from(TABLE(ref.type)).select('*').eq('id', ref.id).maybeSingle()
    const u = Number(ref.units) || 0
    if (r && u > 0) {
      const upd = ref.type === 'mutual_funds'
        ? { units: Math.max(0, (Number(r.units) || 0) - u), invested_amount: Math.max(0, (Number(r.invested_amount) || 0) - amount) }
        : ref.type === 'stocks'
          ? { quantity: Math.max(0, (Number(r.quantity) || 0) - u), ...((Number(r.quantity) || 0) - u > 0 ? { avg_buy_price: Math.max(0, ((Number(r.quantity) || 0) * (Number(r.avg_buy_price) || 0) - amount) / ((Number(r.quantity) || 0) - u)) } : {}) }
          : { units: Math.max(0, (Number(r.units) || 0) - u), ...((Number(r.units) || 0) - u > 0 ? { avg_buy_price: Math.max(0, ((Number(r.units) || 0) * (Number(r.avg_buy_price) || 0) - amount) / ((Number(r.units) || 0) - u)) } : {}) }
      await supabase.from(ref.type).update(upd).eq('id', ref.id)
    }
  }
  if (ref.loan_txn_id) await supabase.from('loan_transactions').delete().eq('id', ref.loan_txn_id)
  // The month marker goes back only if nothing has moved it on since
  if (ref.month) {
    const col = ref.type === 'mutual_funds' ? 'sip_last_month' : ref.type === 'recurring_deposits' ? 'rd_last_month' : ref.type === 'loan' ? 'emi_last_month' : null
    if (col) await supabase.from(TABLE(ref.type)).update({ [col]: ref.prev_month ?? null }).eq('id', ref.id).eq(col, ref.month)
  }
}
