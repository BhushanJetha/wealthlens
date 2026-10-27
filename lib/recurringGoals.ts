// Recurring goals — Diwali, birthdays, LIC premiums, gold on Dhanteras,
// school fees: a pot filled a little each month and spent on its date, then
// started again for the next date with anything left over carried in. The
// monthly amount is the same maths as Budgets' yearly costs (fundPlan), so
// both pages agree. Ideas come from your policies and your own spending.
import { isRecurring, monthsUntil, type Cur } from './goals'
import { fundPlan, FIXED, NOT_PLANABLE } from './budgets'
import { DIWALI, OCCASIONS, nextDueDate, occasionOf } from './occasions'
import { isSpend, catOf } from './money'
import type { Idea } from './goalIdeas'

const utc = (d: string) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`)
export const daysUntil = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 864e5)
const addDays = (d: string, n: number) => new Date(utc(d) + n * 864e5).toISOString().slice(0, 10)
function addMonthsTo(d: string, n: number) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return `${first.toISOString().slice(0, 8)}${String(Math.min(day, dim)).padStart(2, '0')}`
}
const money = (v: number, cur: Cur) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(v).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')}`
const day = (d: string) => new Date(utc(d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const roundUp = (v: number, cur: Cur) => { const step = cur === 'AED' ? 100 : 1000; return Math.ceil(v / step) * step }

// ── This round of a recurring goal ───────────────────────────────────────────
// ready: all there · done: this month's set aside · todo: this month's still to
// do · short: due within 30 days and not all there · new: nothing yet ·
// passed: the date's gone — record what you spent and start the next round
export type RecStatus = 'ready' | 'done' | 'todo' | 'short' | 'new' | 'passed' | 'paused'
export const REC_STATUS: Record<RecStatus, { label: string; bg: string; c: string }> = {
  ready:  { label: 'Ready', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  done:   { label: 'Set aside ✓', bg: 'var(--pos-bg)', c: 'var(--pos-text)' },
  todo:   { label: 'To set aside', bg: 'var(--accent-bg)', c: 'var(--accent2)' },
  short:  { label: 'Due soon', bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
  new:    { label: 'Not started', bg: '#F1F5F9', c: 'var(--text3)' },
  passed: { label: 'Date passed', bg: 'var(--amber-bg)', c: 'var(--amber-text)' },
  paused: { label: 'Paused', bg: '#F1F5F9', c: 'var(--text3)' },
}
export interface RecurringState {
  due: string; next: string; days: number
  saved: number; left: number; pct: number
  monthly: number; slots: number          // set aside this much, this many more times
  thisMonth: number; doneThisMonth: boolean
  status: RecStatus
}
export function recurringState(g: any, value: number, contributions: { goal_id: string; amount: number; contrib_date: string }[], today: string): RecurringState {
  const due = String(g.target_date).slice(0, 10), target = Number(g.target_amount) || 0
  const ym = today.slice(0, 7)
  const ins = contributions.filter(c => c.goal_id === g.id && Number(c.amount) > 0 && String(c.contrib_date).slice(0, 10) <= today)
  const thisMonth = ins.filter(c => String(c.contrib_date).slice(0, 7) === ym).reduce((s, c) => s + Number(c.amount), 0)
  const last = ins.map(c => String(c.contrib_date).slice(0, 7)).sort().pop() ?? null
  const cur: Cur = g.currency === 'AED' ? 'AED' : 'INR'
  const fp = fundPlan({ id: g.id, name: g.name, category: g.spend_category ?? null, currency: cur, target, due_date: due, saved: value, last_saved_month: last }, today)
  const days = daysUntil(today, due)
  const status: RecStatus = g.status === 'paused' ? 'paused' : days < 0 ? 'passed' : fp.left <= 0 ? 'ready'
    : days <= 30 ? 'short' : fp.doneThisMonth ? 'done' : value <= 0 && !Number(g.cycles_done) ? 'new' : 'todo'
  return {
    due, next: nextDueDate(g), days, saved: value, left: fp.left, pct: fp.pct,
    monthly: days < 0 ? 0 : fp.monthly, slots: fp.slots, thisMonth, doneThisMonth: fp.doneThisMonth, status,
  }
}

// The dates a recurring goal falls on in the 12 months from this one
export function datesAhead(g: any, today: string, months = 12): string[] {
  const end = addMonthsTo(`${today.slice(0, 7)}-01`, months)
  const out: string[] = []
  let d = String(g.target_date).slice(0, 10), guard = 0
  while (d < end && guard++ < 24) {
    if (d.slice(0, 7) >= today.slice(0, 7)) out.push(d)
    const n = nextDueDate({ ...g, target_date: d })
    if (n <= d) break
    d = n
  }
  return out
}

// ── Saving to it (client side, takes the browser Supabase client) ────────────
export async function setAside(supabase: any, uid: string, goals: { goal: any; amount: number }[], date: string) {
  const rows = goals.filter(x => x.amount > 0).map(({ goal, amount }) => ({
    user_id: uid, goal_id: goal.id, amount: Math.round(amount), currency: goal.currency === 'AED' ? 'AED' : 'INR', contrib_date: date, note: 'Set aside this month',
  }))
  if (!rows.length) return { error: null }
  return supabase.from('goal_contributions').insert(rows)
}
// Done for this time: take out what was spent (unless it's kept in a linked
// account, whose balance already shows it), move to the next date, and count
// the round. Anything left stays for next time.
export async function rollRecurring(supabase: any, uid: string, goal: any, opts: { spent: number; next: string; target?: number; label: string; date: string }) {
  const cur = goal.currency === 'AED' ? 'AED' : 'INR'
  if (opts.spent > 0 && !goal.account_id) {
    const { error } = await supabase.from('goal_contributions').insert({ user_id: uid, goal_id: goal.id, amount: -Math.round(opts.spent), currency: cur, contrib_date: opts.date, note: `Spent on ${opts.label}` })
    if (error) return { error }
  }
  const patch: Record<string, any> = { target_date: opts.next, cycles_done: (Number(goal.cycles_done) || 0) + 1, updated_at: new Date().toISOString() }
  if (opts.target && opts.target > 0) patch.target_amount = opts.target
  let res = await supabase.from('goals').update(patch).eq('id', goal.id)
  if (res.error && /cycles_done/.test(res.error.message)) { delete patch.cycles_done; res = await supabase.from('goals').update(patch).eq('id', goal.id) }
  return res
}
// What a round is called: "Diwali 2026", "LIC premium Mar 2027"
export const roundLabel = (g: any) => {
  const d = String(g.target_date).slice(0, 10), occ = occasionOf(g.occasion)
  return occ && occ.next(addDays(d, -1)) === d ? `${g.name} ${d.slice(0, 4)}` : `${g.name} (${day(d)})`
}

// ── Ideas from your own data ─────────────────────────────────────────────────
export interface RecIdeaInput {
  goals: any[]; today: string
  transactions: any[]                // the last ~14 months
  lic: any[]; insurance: any[]; gold: any[]
  members: { name: string; relationship: string }[]
}
const FREQ: Record<string, number> = { annually: 12, annual: 12, yearly: 12, 'half-yearly': 6, half_yearly: 6, semi_annual: 6, 'semi-annual': 6, quarterly: 3, monthly: 1 }
// A date that repeats every `every` months, moved forward to today or later
function rollForward(d: string | null | undefined, every: number, today: string) {
  if (!d) return null
  let x = String(d).slice(0, 10), guard = 0
  while (x < today && guard++ < 200) x = addMonthsTo(x, every)
  return x >= today ? x : null
}
const normName = (s: unknown) => String(s ?? '').toLowerCase()
  .replace(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g, ' ').replace(/[^a-z]/g, '').slice(0, 24)
const titleCase = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 32).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())

export function recurringIdeas(p: RecIdeaInput): Idea[] {
  const live = p.goals.filter(g => g.status !== 'cancelled' && isRecurring(g))
  const hasOcc = (key: string, cur?: Cur) => live.some(g => g.occasion === key && (!cur || g.currency === cur))
  const hasName = (re: RegExp) => live.some(g => re.test(String(g.name ?? '')))
  const out: Idea[] = []
  const monthsTo = (d: string) => Math.max(1, monthsUntil(d, p.today))
  const plan = (target: number, due: string, cur: Cur) => {
    const f = fundPlan({ id: '', name: '', category: null, currency: cur, target, due_date: due, saved: 0, last_saved_month: null }, p.today)
    return `${f.slots} set-aside${f.slots === 1 ? '' : 's'} of ${money(f.monthly, cur)}`
  }

  // Premiums that come every 3, 6 or 12 months (a monthly one is just a bill)
  const policies = [
    ...p.lic.map(x => ({ id: x.id, name: x.name || x.plan_name || 'LIC policy', freq: x.premium_frequency, annual: x.annual_premium, next: x.next_premium_date ?? x.start_date, end: x.maturity_date, cur: (x.currency === 'AED' ? 'AED' : 'INR') as Cur, lic: true })),
    ...p.insurance.map(x => ({ id: x.id, name: x.policy_name || x.provider || 'Insurance', freq: x.premium_frequency, annual: x.annual_premium, next: x.next_premium_date ?? x.start_date, end: x.expiry_date, cur: (x.currency === 'AED' ? 'AED' : 'INR') as Cur, lic: false })),
  ]
  const policyAmounts: { cur: Cur; amount: number }[] = []
  for (const pol of policies) {
    const every = FREQ[String(pol.freq ?? 'annual').toLowerCase()] ?? 12
    const prem = (Number(pol.annual) || 0) * every / 12
    if (every < 3 || !(prem > 0)) continue
    policyAmounts.push({ cur: pol.cur, amount: prem })
    const due = rollForward(pol.next, every, p.today)
    if (!due || (pol.end && due > String(pol.end).slice(0, 10))) continue
    if (live.some(g => g.source_id === pol.id) || hasName(new RegExp(pol.name.replace(/[^\w ]/g, '').slice(0, 20), 'i'))) continue
    const name = pol.lic && !/lic/i.test(pol.name) ? `LIC ${pol.name} premium` : `${pol.name} premium`
    out.push({ id: `pol-${pol.id}`, kind: 'payment', name, currency: pol.cur, target: Math.ceil(prem), months: monthsTo(due), date: due,
      repeat_months: every, source_id: pol.id, spend_category: 'Insurance', priority: 1, occasion: 'lic',
      why: `${money(prem, pol.cur)} is due ${day(due)}${every === 12 ? ', every year' : `, then every ${every} months`}. ${plan(prem, due, pol.cur)} and it's there on the day.` })
  }

  // Diwali, from how much more you spent in the weeks before last Diwali
  const spends = p.transactions.filter(t => isSpend(t) && !FIXED.has(catOf(t)) && !NOT_PLANABLE.has(catOf(t)) && (t.currency === 'AED' || t.currency === 'INR'))
  const first = spends.map(t => String(t.txn_date).slice(0, 10)).sort()[0]
  const lastDiwali = Object.values(DIWALI).filter(d => addDays(d, 3) < p.today).sort().pop()
  const nextDiwali = occasionOf('diwali')!.next(p.today)
  if (lastDiwali && nextDiwali && first) {
    const from = addDays(lastDiwali, -28), to = addDays(lastDiwali, 2), span = daysUntil(from, to) + 1
    const covered = daysUntil(first, p.today) + 1
    for (const cur of ['INR', 'AED'] as Cur[]) {
      if (hasOcc('diwali', cur) || hasName(/diwali|deepavali/i) || first > from || covered - span < 60) continue
      const mine = spends.filter(t => t.currency === cur)
      const inWin = (t: any) => t.txn_date >= from && t.txn_date <= to
      const byCat = (rows: any[]) => rows.reduce((m: Record<string, number>, t) => { m[catOf(t)] = (m[catOf(t)] ?? 0) + (Number(t.amount) || 0); return m }, {})
      const win = byCat(mine.filter(inWin)), rest = byCat(mine.filter(t => !inWin(t)))
      const extraBy = Object.keys(win).map(c => ({ c, x: win[c] - (rest[c] ?? 0) / (covered - span) * span })).filter(r => r.x > 0).sort((a, b) => b.x - a.x)
      const sum = (m: Record<string, number>) => Object.values(m).reduce((s, v) => s + v, 0)
      const extra = sum(win) - sum(rest) / (covered - span) * span
      if (extra < (cur === 'AED' ? 300 : 5000)) continue
      out.push({ id: `diwali-${cur}`, kind: 'celebration', name: 'Diwali shopping & gifts', currency: cur, target: roundUp(extra, cur), months: monthsTo(nextDiwali), date: nextDiwali,
        repeat_months: 12, occasion: 'diwali', spend_category: extraBy[0]?.c ?? 'Shopping', priority: 2,
        why: `In the weeks before last Diwali you spent about ${money(extra, cur)} more than usual${extraBy.length ? ` — mostly ${extraBy.slice(0, 2).map(r => r.c.toLowerCase()).join(' and ')}` : ''}. Save it ahead this time: ${plan(roundUp(extra, cur), nextDiwali, cur)}.` })
    }
  }

  // Gold bought around Dhanteras (two days before Diwali)
  const dhanteras = Object.values(DIWALI).map(d => addDays(d, -2))
  const nextDhan = occasionOf('dhanteras')!.next(p.today)
  if (nextDhan && !hasOcc('dhanteras') && !hasName(/dhanteras|gold/i)) {
    const near = (d: string) => dhanteras.some(x => Math.abs(daysUntil(x, d)) <= 7)
    const bought = p.gold.filter(x => x.purchase_date && near(String(x.purchase_date).slice(0, 10)) && String(x.purchase_date) < p.today)
      .sort((a, b) => String(b.purchase_date).localeCompare(String(a.purchase_date)))
    const lastYear = bought.length ? String(bought[0].purchase_date).slice(0, 4) : null
    const amt = bought.filter(x => String(x.purchase_date).slice(0, 4) === lastYear).reduce((s, x) => s + (Number(x.invested_amount) || 0), 0)
    const cur: Cur = bought[0]?.currency === 'AED' ? 'AED' : 'INR'
    if (amt > 0) out.push({ id: 'dhanteras', kind: 'gold', name: 'Gold on Dhanteras', currency: cur, target: roundUp(amt, cur), months: monthsTo(nextDhan), date: nextDhan,
      repeat_months: 12, occasion: 'dhanteras', spend_category: 'Investment', priority: 3,
      why: `You bought ${money(amt, cur)} of gold around Dhanteras ${lastYear}. Put a little aside each month and buy this year's from savings: ${plan(roundUp(amt, cur), nextDhan, cur)}.` })
  }

  // Charges that come once a year: the same payee about 11–13 months apart,
  // a similar amount, nothing in between
  const groups: Record<string, any[]> = {}
  for (const t of p.transactions.filter(t => isSpend(t) && !NOT_PLANABLE.has(catOf(t)) && !['Investment', 'EMI/Loan', 'Family Transfer'].includes(catOf(t)) && (t.currency === 'AED' || t.currency === 'INR'))) {
    const k = normName(t.merchant || t.description)
    if (k.length >= 3) (groups[`${t.currency}|${k}`] ??= []).push(t)
  }
  const yearly: Idea[] = []
  for (const [key, rows] of Object.entries(groups)) {
    if (rows.length < 2 || rows.length > 3) continue
    const s = [...rows].sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)))
    const a = s[s.length - 2], b = s[s.length - 1], cur = b.currency as Cur
    const gap = daysUntil(a.txn_date, b.txn_date), amtA = Number(a.amount) || 0, amtB = Number(b.amount) || 0
    if (gap < 330 || gap > 400 || amtB < (cur === 'AED' ? 200 : 3000) || Math.abs(amtA - amtB) > Math.max(amtA, amtB) * 0.2) continue
    const next = addMonthsTo(String(b.txn_date).slice(0, 10), 12)
    if (next < p.today || next > addMonthsTo(p.today, 13)) continue
    if (policyAmounts.some(x => x.cur === cur && Math.abs(x.amount - amtB) <= amtB * 0.1)) continue
    const label = titleCase(String(b.merchant || b.description || 'Yearly charge'))
    if (hasName(new RegExp(label.replace(/[^\w ]/g, '').slice(0, 16), 'i'))) continue
    yearly.push({ id: `yearly-${key}`, kind: 'payment', name: label, currency: cur, target: roundUp(amtB, cur), months: monthsTo(next), date: next,
      repeat_months: 12, spend_category: catOf(b), priority: 1,
      why: `You paid ${money(amtA, cur)} on ${day(a.txn_date)} and ${money(amtB, cur)} on ${day(b.txn_date)} — it looks yearly, next around ${day(next)}. ${plan(roundUp(amtB, cur), next, cur)} spreads it out.` })
  }
  out.push(...yearly.sort((a, b) => b.target - a.target).slice(0, 3))
  return out
}

// Occasion templates, plus a birthday for each person in the family
export function occasionTemplates(goals: any[], members: { name: string; relationship: string }[], today: string, cur: Cur) {
  const live = goals.filter(g => g.status !== 'cancelled' && isRecurring(g))
  const list = OCCASIONS.filter(o => !live.some(g => g.occasion === o.key && g.currency === cur) || o.key === 'birthday')
    .map(o => ({ key: o.key, name: o.name, icon: o.icon, kind: o.kind, amount: o.amount[cur], date: o.next(today), hint: o.hint, category: o.category, priority: o.priority, holder: null as string | null }))
  const people = members.filter(m => /child|son|daughter|kid|spouse|wife|husband|partner/i.test(m.relationship))
    .filter(m => !live.some(g => g.occasion === 'birthday' && g.holder_name === m.name))
  const bday = OCCASIONS.find(o => o.key === 'birthday')!
  const births = people.map(m => ({ key: `birthday-${m.name}`, name: `${m.name.split(' ')[0]}'s birthday`, icon: bday.icon, kind: bday.kind, amount: bday.amount[cur], date: null, hint: 'pick the birthday', category: bday.category, priority: bday.priority, holder: m.name }))
  return [...births, ...list.filter(o => o.key !== 'birthday' || !births.length)]
}

// The date before this one (last Diwali, last premium) — for "last time you spent"
export function prevDueDate(g: any): string {
  const d = String(g.target_date).slice(0, 10)
  const back = addMonthsTo(d, -(Number(g.repeat_months) || 12))
  const fromOcc = occasionOf(g.occasion)?.next(addDays(back, -45))
  return fromOcc && fromOcc < d ? fromOcc : back
}
// Budget categories you actually spend on, most used first (for "Pays for")
export function spendCategories(txns: any[]): string[] {
  const n: Record<string, number> = {}
  for (const t of txns) if (isSpend(t) && !NOT_PLANABLE.has(catOf(t))) n[catOf(t)] = (n[catOf(t)] ?? 0) + 1
  return Object.keys(n).sort((a, b) => n[b] - n[a])
}
