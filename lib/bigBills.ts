// Big bills: what comes every few months (internet, TV, LIC, insurance, school
// fees, rent cheques). A bill is a recurring goal, so the pot, the monthly
// set-aside and the Budgets cover are the ones Goals already uses; a policy with
// no pot yet shows as a bill and gets its goal the first time you act on it.
// Set-aside money stays in your bank: it's only reserved inside the app.
import { fundPlan } from './budgets'
import { catOf, isSpend } from './money'
import { nextDueDate } from './occasions'
import { isRecurring, kindInfo, investmentValue, type Cur } from './goals'
import { addMonthsTo, daysUntil, datesAhead, normName, POLICY_FREQ, rollForward, rollRecurring, setAside } from './recurringGoals'
import { autoTag } from './recurring'
import { fmtMoney } from './format'

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const curOf = (c: unknown): Cur => (c === 'AED' ? 'AED' : 'INR')

export const policyEvery = (freq: unknown) => POLICY_FREQ[String(freq ?? 'annual').toLowerCase()] ?? 12
export const MIN_BILL: Record<Cur, number> = { INR: 1000, AED: 100 }

export type PolicyTable = 'insurance_policies' | 'lic_policies'
export interface Bill {
  key: string                       // goal:<id> · ins:<id> · lic:<id>
  name: string; sub: string; category: string | null; currency: Cur
  amount: number; every: number; due: string; days: number
  goal: any | null                  // the pot; none yet for a policy nobody's set aside for
  policy: { table: PolicyTable; id: string; provider?: string | null; total_paid?: number } | null
  saved: number; left: number; pct: number
  monthly: number; slots: number; normal: number; doneThisMonth: boolean
  rise: { from: number; pct: number } | null
}

// held: what investments linked to each pot are worth (heldByGoal), by goal id
export interface BillsData { goals: any[]; contributions: any[]; insurance: any[]; lic: any[]; accounts: any[]; skips: string[]; held?: Record<string, number> }

// What the investments linked to each goal are worth (its share of each), in the
// goal's currency. An RD or FD you keep for a bill fills its pot this way.
export function heldByGoal(goals: any[], links: any[], investments: Record<string, any[]>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of links) {
    const g = goals.find(x => x.id === l.goal_id), rec = (investments[l.investment_type] ?? []).find(r => r.id === l.investment_id)
    if (!g || !rec || curOf(rec.currency) !== curOf(g.currency)) continue
    out[g.id] = (out[g.id] ?? 0) + investmentValue(l.investment_type, rec) * (Number(l.allocation_pct ?? 100) / 100)
  }
  return out
}

// What a pot holds: every set-aside and payment, plus a linked account's
// balance and linked investments
export function potOf(g: any, contributions: any[], accounts: any[], held: Record<string, number> = {}) {
  const cur = curOf(g.currency)
  const mine = contributions.filter(c => c.goal_id === g.id)
  const acc = g.account_id ? accounts.find(a => a.id === g.account_id && a.currency === cur) : null
  const saved = Math.max(0, mine.reduce((s, c) => s + (Number(c.amount) || 0), 0) + (acc ? Math.max(0, Number(acc.current_balance) || 0) : 0) + (held[g.id] ?? 0))
  const last = mine.filter(c => Number(c.amount) > 0).map(c => String(c.contrib_date).slice(0, 7)).sort().pop() ?? null
  return { saved, last }
}

export function buildBills(d: BillsData, today: string): Bill[] {
  const skips = new Set(d.skips)
  const live = d.goals.filter(g => isRecurring(g) && g.status === 'active')
  const policies = [
    ...d.insurance.map(p => ({ table: 'insurance_policies' as const, prefix: 'ins', id: p.id, name: p.policy_name || p.provider || 'Insurance', provider: p.provider, annual: p.annual_premium, freq: p.premium_frequency, next: p.next_premium_date ?? p.start_date, end: p.expiry_date, currency: curOf(p.currency), total_paid: undefined })),
    ...d.lic.map(p => ({ table: 'lic_policies' as const, prefix: 'lic', id: p.id, name: p.name || p.plan_name || 'LIC policy', provider: 'LIC', annual: p.annual_premium, freq: p.premium_frequency, next: p.next_premium_date ?? p.start_date, end: p.maturity_date, currency: curOf(p.currency), total_paid: Number(p.total_paid) || 0 })),
  ].map(p => {
    const every = policyEvery(p.freq)
    return { ...p, every, per: (Number(p.annual) || 0) * every / 12, due: rollForward(p.next, every, today) }
  }).filter(p => p.every >= 2 && p.per > 0 && p.due && !(p.end && p.due > String(p.end).slice(0, 10)))

  const linkOf = (g: any) => policies.find(p => g.source_id === p.id)
    ?? policies.find(p => !g.source_id && p.currency === curOf(g.currency) && String(g.name ?? '').toLowerCase().includes(String(p.name).toLowerCase().slice(0, 20)))

  const out: Bill[] = []
  const shape = (x: Pick<Bill, 'key' | 'name' | 'sub' | 'category' | 'currency' | 'amount' | 'every' | 'due' | 'goal' | 'policy'>, saved: number, last: string | null, rise: Bill['rise']): Bill => {
    const f = fundPlan({ id: x.key, name: x.name, category: x.category, currency: x.currency, target: x.amount, due_date: x.due, saved, last_saved_month: last }, today)
    const step = x.currency === 'AED' ? 10 : 100
    return { ...x, days: daysUntil(today, x.due), saved, left: f.left, pct: f.pct, monthly: f.monthly, slots: f.slots, normal: Math.ceil(x.amount / Math.max(1, x.every) / step) * step, doneThisMonth: f.doneThisMonth, rise }
  }
  for (const g of live) {
    const link = linkOf(g), { saved, last } = potOf(g, d.contributions, d.accounts, d.held)
    const target = Number(g.target_amount) || 0, amount = link ? Math.ceil(link.per) : target
    const dated = String(g.target_date).slice(0, 10)
    const due = link && dated >= today ? link.due! : dated          // a date that's gone stays until you say it's paid
    const before = Number(g.last_amount) > 0 ? Number(g.last_amount) : link && target > 0 && target < amount ? target : 0
    const rise = before > 0 && amount > before * 1.05 ? { from: before, pct: Math.round((amount / before - 1) * 100) } : null
    out.push(shape({ key: `goal:${g.id}`, name: g.name, sub: link ? link.provider || 'Insurance' : 'Your bill', category: g.spend_category ?? (link ? 'Insurance' : null), currency: curOf(g.currency), amount, every: Number(g.repeat_months), due, goal: g,
      policy: link ? { table: link.table, id: link.id, provider: link.provider, total_paid: link.total_paid } : null }, saved, last, rise))
  }
  const linked = new Set(out.filter(b => b.policy).map(b => b.policy!.id))
  for (const p of policies) {
    const key = `${p.prefix}:${p.id}`
    if (linked.has(p.id) || skips.has(`hide:${key}`)) continue
    out.push(shape({ key, name: p.table === 'lic_policies' && !/lic/i.test(p.name) ? `LIC ${p.name}` : p.name, sub: p.provider || 'Insurance', category: 'Insurance', currency: p.currency, amount: Math.ceil(p.per), every: p.every, due: p.due!, goal: null,
      policy: { table: p.table, id: p.id, provider: p.provider, total_paid: p.total_paid } }, 0, null, null))
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}

// Why this much a month: the even amount, or more because it started late
export function whyMonthly(b: Bill) {
  if (b.left <= 0) return 'All set aside.'
  const m = fmtMoney(b.monthly, b.currency), n = b.slots
  const times = n === 1 ? 'this month' : `for ${n} months`
  if (b.monthly > b.normal) return `${m} ${times}, more than the usual ${fmtMoney(b.normal, b.currency)} because ${n === 1 ? 'only this month is' : `only ${n} months are`} left.`
  return `${m} ${times} and it's there on ${day(b.due)}.`
}

// ── What's reserved (comes off Free to spend) ────────────────────────────────
// A bill due before payday is already in the dues in full, so it isn't taken off
// twice. One whose date passed stays held until you say it's paid.
export function reservedFor(bills: Bill[], cur: Cur, until: string, today: string) {
  return bills.filter(b => b.currency === cur && (b.due > until || b.due < today)).reduce((s, b) => s + Math.min(b.saved, b.amount), 0)
}

export function billTotals(bills: Bill[], cur: Cur) {
  const mine = bills.filter(b => b.currency === cur)
  return { monthly: mine.reduce((s, b) => s + b.monthly, 0), saved: mine.reduce((s, b) => s + Math.min(b.saved, b.amount), 0), next: mine.find(b => b.days >= 0) ?? mine[0] ?? null, count: mine.length }
}

// ── Can you cover it? ────────────────────────────────────────────────────────
// Earliest first, each takes what it needs from the money that's still free
export type CoverState = 'ready' | 'covered' | 'short'
export interface Cover { state: CoverState; short: number; tip: string }
export function coverBills(bills: Bill[], spare: Partial<Record<Cur, number>>, accounts: any[]): Record<string, Cover> {
  const free: Record<string, number> = { AED: Math.max(0, spare.AED ?? 0), INR: Math.max(0, spare.INR ?? 0) }
  const out: Record<string, Cover> = {}
  for (const b of bills) {
    const money = (n: number) => fmtMoney(n, b.currency)
    if (b.left <= 0) { out[b.key] = { state: 'ready', short: 0, tip: 'The full amount is set aside.' }; continue }
    const have = free[b.currency]
    if (have >= b.left) {
      free[b.currency] -= b.left
      out[b.key] = { state: 'covered', short: 0, tip: `Your free money can cover the ${money(b.left)} still needed.` }
      continue
    }
    free[b.currency] = 0
    const short = b.left - have
    const other = b.currency === 'AED' ? 'INR' : 'AED'
    const elsewhere = accounts.filter(a => a.currency === other && a.account_type !== 'credit_card' && Number(a.current_balance) > 0).sort((x, y) => Number(y.current_balance) - Number(x.current_balance))[0]
    const tip = b.days > 31 ? `${money(b.monthly)} a month gets you there by ${day(b.due)}.`
      : elsewhere && free[other] > 0 ? `Not enough ${b.currency === 'AED' ? 'in the UAE' : 'in India'} yet. ${elsewhere.name} has money you could move.`
      : `Set aside what you can now, or plan to move money before ${day(b.due)}.`
    out[b.key] = { state: 'short', short, tip }
  }
  return out
}

// ── Reminders for Needs you ──────────────────────────────────────────────────
export type ReminderKind = 'paid' | 'due' | 'soon' | 'month' | 'group'
export interface BillReminder {
  id: string; kind: ReminderKind; title: string; sub: string
  bill: Bill | null; bills: Bill[]; amount: number; currency: Cur; skip: string | null; txn: any | null
}

// The payment a statement may already have brought in: same currency, around the
// date, about the amount, and the same payee (or the same category to the rupee)
export function findPayment(b: Bill, txns: any[]) {
  const key = normName(b.name), alt = normName(b.policy?.provider)
  const from = addDays(b.due, -20), to = addDays(b.due, 10)
  return txns.find(t => {
    const date = String(t.txn_date).slice(0, 10), amt = Number(t.amount) || 0
    if (t.currency !== b.currency || date < from || date > to || !isSpend(t) || t.auto_status === 'pending') return false
    if (b.goal?.last_paid_on && date <= String(b.goal.last_paid_on).slice(0, 10)) return false
    if (Math.abs(amt - b.amount) > b.amount * 0.15) return false
    const who = normName(t.merchant || t.description)
    const named = who.length >= 4 && (key.includes(who.slice(0, 8)) || who.includes(key.slice(0, 8)) || (alt.length >= 3 && who.includes(alt)))
    return named || (!!b.category && catOf(t) === b.category && Math.abs(amt - b.amount) <= b.amount * 0.02)
  }) ?? null
}

export function billReminders(bills: Bill[], txns: any[], today: string, skipList: string[]): BillReminder[] {
  const skips = new Set(skipList), out: BillReminder[] = [], month: BillReminder[] = []
  const ym = today.slice(0, 7)
  for (const b of bills) {
    const money = (n: number) => fmtMoney(n, b.currency)
    const base = { bill: b, bills: [b], currency: b.currency, txn: null, skip: null }
    const progress = b.left <= 0 ? 'All set aside' : b.saved > 0 ? `${money(b.saved)} set aside, ${money(b.left)} still short` : `Nothing set aside yet, ${money(b.left)} short`
    const when = b.days < 0 ? `was due ${day(b.due)}` : b.days === 0 ? 'is due today' : b.days === 1 ? 'is due tomorrow' : `is due in ${b.days} days`
    if (b.days <= 10 && !skips.has(`notpaid:${b.key}:${b.due}`)) {
      const txn = findPayment(b, txns)
      if (txn) { out.push({ ...base, id: `paid-${b.key}`, kind: 'paid', title: `Did this pay ${b.name}?`, sub: `${txn.merchant || 'A payment'} · ${money(Number(txn.amount))} on ${day(String(txn.txn_date).slice(0, 10))}`, amount: Number(txn.amount), txn, skip: `notpaid:${b.key}:${b.due}` }); continue }
    }
    if (b.days <= 7) {
      out.push({ ...base, id: `due-${b.key}`, kind: 'due', title: `${b.name} ${when} · ${money(b.amount)}`, sub: progress, amount: b.left })
    } else if (b.left > 0 && b.days <= 30 && !skips.has(`soon:${b.key}:${b.due}`)) {
      out.push({ ...base, id: `soon-${b.key}`, kind: 'soon', title: `${b.name} · ${money(b.amount)} due on ${day(b.due)}`, sub: progress, amount: b.left, skip: `soon:${b.key}:${b.due}` })
    } else if (b.left > 0 && !b.doneThisMonth && !skips.has(`month:${b.key}:${ym}`)) {
      month.push({ ...base, id: `month-${b.key}`, kind: 'month', title: `Set aside ${money(b.monthly)} for ${b.name}`, sub: `${money(b.amount)} due on ${day(b.due)}`, amount: b.monthly, skip: `month:${b.key}:${ym}` })
    }
  }
  // Several this month read as one job
  for (const cur of ['INR', 'AED'] as Cur[]) {
    const mine = month.filter(r => r.currency === cur)
    if (mine.length <= 2) { out.push(...mine); continue }
    const total = mine.reduce((s, r) => s + r.amount, 0)
    out.push({ id: `group-${cur}`, kind: 'group', title: `Set aside ${fmtMoney(total, cur)} for ${mine.length} big bills`, sub: mine.slice(0, 3).map(r => r.bill!.name).join(', ') + (mine.length > 3 ? ` and ${mine.length - 3} more` : ''),
      bill: null, bills: mine.map(r => r.bill!), amount: total, currency: cur, skip: null, txn: null })
  }
  return out
}

// ── The year ahead ───────────────────────────────────────────────────────────
export interface YearMonth { ym: string; total: number; items: { name: string; amount: number; date: string }[]; heavy: boolean }
export function yearAhead(bills: Bill[], cur: Cur, today: string): YearMonth[] {
  const months: YearMonth[] = []
  for (let i = 0; i < 12; i++) months.push({ ym: addMonthsTo(`${today.slice(0, 7)}-01`, i).slice(0, 7), total: 0, items: [], heavy: false })
  for (const b of bills.filter(x => x.currency === cur)) {
    const dates = datesAhead(b.goal ? { ...b.goal, target_date: b.due } : { target_date: b.due, repeat_months: b.every }, today)
    for (const d of dates) {
      const m = months.find(x => x.ym === d.slice(0, 7))
      if (m) { m.total += b.amount; m.items.push({ name: b.name, amount: b.amount, date: d }) }
    }
  }
  const mean = months.reduce((s, m) => s + m.total, 0) / 12
  // Heavy means heavier than your other bill months, not just that a bill falls in it
  const lightest = Math.min(...months.filter(m => m.total > 0).map(m => m.total))
  for (const m of months) m.heavy = m.total > lightest && m.total >= mean * 2
  return months
}

// ── Doing it (client side, takes the browser Supabase client) ────────────────
export interface BillForm { name: string; amount: number; currency: Cur; due: string; every: number; category?: string | null; source_id?: string | null; occasion?: string | null }
export function billGoalRow(uid: string, f: BillForm) {
  const info = kindInfo('payment')
  return { user_id: uid, name: f.name.trim(), target_amount: f.amount, currency: f.currency, country: f.currency === 'AED' ? 'UAE' : 'India', target_date: f.due, category: 'general',
    color: info.color, icon: info.icon, kind: 'payment', priority: 1, status: 'active', track_cash: false, repeat_months: f.every, occasion: f.occasion ?? null, spend_category: f.category || null, source_id: f.source_id ?? null }
}
export async function potFor(sb: any, uid: string, b: Bill): Promise<{ goal?: any; error?: string }> {
  if (b.goal) return { goal: b.goal }
  const { data, error } = await sb.from('goals').insert(billGoalRow(uid, { name: b.name, amount: b.amount, currency: b.currency, due: b.due, every: b.every, category: b.category, source_id: b.policy?.id, occasion: b.policy?.table === 'lic_policies' ? 'lic' : null })).select().single()
  return error ? { error: error.message } : { goal: data }
}
export async function setAsideBill(sb: any, uid: string, b: Bill, amount: number, date: string): Promise<string | null> {
  const pot = await potFor(sb, uid, b)
  if (pot.error) return pot.error
  const r = await setAside(sb, uid, [{ goal: pot.goal, amount }], date)
  return r.error?.message ?? null
}
// Money you no longer want held. It isn't a payment, so Budgets doesn't count it
export const TAKEN_BACK = 'Taken back'
export async function takeBack(sb: any, uid: string, b: Bill, amount: number, date: string): Promise<string | null> {
  if (!b.goal) return null
  const { error } = await sb.from('goal_contributions').insert({ user_id: uid, goal_id: b.goal.id, amount: -Math.round(Math.min(amount, b.saved)), currency: b.currency, contrib_date: date, note: TAKEN_BACK })
  return error?.message ?? null
}
export function billPaymentRow(uid: string, b: Bill, o: { amount: number; date: string; accountId: string | null; category?: string | null }) {
  return { user_id: uid, txn_date: o.date, merchant: b.name, amount: o.amount, currency: b.currency, country: b.currency === 'AED' ? 'UAE' : 'India', txn_type: 'expense', category: o.category || b.category || 'Other',
    account_id: o.accountId, source: 'manual', is_verified: true, ...autoTag({ kind: 'bill', id: b.key, month: b.due.slice(0, 7), amount: o.amount }, false) }
}
// Paid: adds the expense (unless a statement already did), uses the money set
// aside, moves the bill to its next date and remembers what it cost
export async function payBill(sb: any, uid: string, b: Bill, o: { amount: number; date: string; accountId: string | null; category?: string | null; existing?: boolean }): Promise<string | null> {
  if (!o.existing) {
    const { error } = await sb.from('transactions').insert(billPaymentRow(uid, b, o))
    if (error) return error.message
  }
  const next = b.goal ? nextDueDate({ ...b.goal, target_date: b.due }) : addMonthsTo(b.due, b.every)
  if (b.goal) {
    const r = await rollRecurring(sb, uid, b.goal, { spent: Math.min(b.saved, o.amount), next, target: o.amount, label: `${b.name} ${day(b.due)}`, date: o.date })
    if (r?.error) return r.error.message
    // Needs migration 041; everything else works without it
    await sb.from('goals').update({ last_amount: b.amount, last_paid_on: o.date }).eq('id', b.goal.id)
  }
  if (b.policy) {
    const patch: Record<string, any> = { next_premium_date: next }
    if (b.policy.table === 'lic_policies') patch.total_paid = (b.policy.total_paid ?? 0) + o.amount
    const { error } = await sb.from(b.policy.table).update(patch).eq('id', b.policy.id)
    if (error) return error.message
  }
  return null
}
export async function skipBill(sb: any, uid: string, key: string): Promise<string | null> {
  const { error } = await sb.from('big_bill_skips').upsert({ user_id: uid, key }, { onConflict: 'user_id,key' })
  return error ? (/big_bill_skips/.test(error.message) ? 'Run migration 041 in Supabase to save this.' : error.message) : null
}

// For the loaders: the reads Big bills needs on top of what each page has
// (the third: what investments linked to bill pots are worth, read only when there are links)
export const loadBillReads = (supabase: any, uid: string) => Promise.all([
  supabase.from('goal_contributions').select('id,goal_id,amount,contrib_date,note,currency').eq('user_id', uid),
  supabase.from('big_bill_skips').select('key').eq('user_id', uid),
  loadBillHeld(supabase, uid),
])
// What a bill's money can be kept in: your investments (an RD or FD kept for
// it, a fund…), with what other goals already use of each, and the links
export interface Holding { type: string; id: string; name: string; currency: Cur; value: number }
const HOLDING_TABLES = ['recurring_deposits', 'fixed_deposits', 'mutual_funds', 'bond_investments', 'etf_investments', 'gold_investments', 'stocks', 'nps_accounts'] as const
const holdingName = (t: string, r: any) => t === 'mutual_funds' ? r.fund_name : t === 'stocks' ? `${r.name ?? r.symbol}` : t === 'etf_investments' ? r.etf_name ?? r.name : r.name ?? r.bank_name
export async function loadBillHoldings(supabase: any, uid: string): Promise<{ holdings: Holding[]; links: any[] }> {
  const [linksRes, ...rows] = await Promise.all([
    supabase.from('goal_investments').select('goal_id,investment_type,investment_id,allocation_pct').eq('user_id', uid),
    ...HOLDING_TABLES.map(t => { const q = supabase.from(t).select('*').eq('user_id', uid); return ['fixed_deposits', 'recurring_deposits'].includes(t) ? q.eq('is_active', true) : q }),
  ])
  const holdings = HOLDING_TABLES.flatMap((t, i) => (rows[i].data ?? []).map((r: any) => ({ type: t, id: r.id, name: String(holdingName(t, r) ?? 'Investment'), currency: curOf(r.currency), value: investmentValue(t, r) })))
  return { holdings, links: linksRes.data ?? [] }
}
export async function loadBillHeld(supabase: any, uid: string): Promise<Record<string, number>> {
  const [linksRes, goalsRes] = await Promise.all([
    supabase.from('goal_investments').select('goal_id,investment_type,investment_id,allocation_pct').eq('user_id', uid),
    supabase.from('goals').select('id,currency').eq('user_id', uid).not('repeat_months', 'is', null),
  ])
  const goals = goalsRes.data ?? [], links = (linksRes.data ?? []).filter((l: any) => goals.some((g: any) => g.id === l.goal_id))
  if (!links.length) return {}
  const tables = Array.from(new Set(links.map((l: any) => String(l.investment_type))))
  const rows = await Promise.all(tables.map(t => supabase.from(t).select('*').eq('user_id', uid).in('id', links.filter((l: any) => l.investment_type === t).map((l: any) => l.investment_id))))
  return heldByGoal(goals, links, Object.fromEntries(tables.map((t, i) => [t, rows[i].data ?? []])))
}
