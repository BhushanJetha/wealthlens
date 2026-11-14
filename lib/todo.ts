// One To do list for everything that needs you: Home's attention items (card
// bills, EMIs, premiums, renewals, maturing deposits, budgets, card use,
// quiet accounts, old prices), Money's (accounts that run short, entries to
// review, which account pays a bill), the portfolio manager's, recurring
// goals, and automatic entries waiting for your OK. Sorted by how soon it
// matters: today, this week, when you can. Pure — the To do page, the bell,
// Home and the overviews all read the same list (/api/todo).
import { buildHomeInsights, daysBetween, fmtDay, type Attention } from './insights'
import { buildDues, expectedIncome, balanceWarnings } from './moneyOverview'
import { findReviewItems, reviewCount } from './review'
import { recurringState } from './recurringGoals'
import type { BuilderDue } from './property'

export type TodoGroup = 'today' | 'week' | 'later'
export type TodoArea = 'money' | 'wealth' | 'plan'
export interface TodoItem {
  id: string; group: TodoGroup; area: TodoArea; icon: string
  title: string; detail: string; href: string; action: string
  upload?: boolean                         // the action opens the statement import
}
export const GROUP_LABEL: Record<TodoGroup, string> = { today: 'Today', week: 'This week', later: 'When you can' }
export const AREA_LABEL: Record<TodoArea, string> = { money: 'Money', wealth: 'Wealth', plan: 'Plan' }

export interface PortfolioNeed { id: string; icon: string; tone: 'warn' | 'info' | 'good'; title: string; detail: string; href: string }
export interface TodoInput {
  today: string; fx: number
  txns: any[]; accounts: any[]; loans: any[]; insurance: any[]
  stocks: any[]; mutualFunds: any[]; fixedDeposits: any[]; rds: any[]; lic: any[]
  budgets: any[]; recurring: any[]; plans: any[]; bills: any[]; answers: string[]
  recGoals: any[]; contributions: any[]
  needs: PortfolioNeed[]                   // lib/portfolio/build
  confirm: number                          // automatic entries waiting for a yes or no
  builder?: BuilderDue[]                   // your part of the builder payments ahead (lib/property)
}

const SEV: Record<Attention['severity'], TodoGroup> = { high: 'today', medium: 'week', low: 'later' }
// Which area an attention item belongs to, by its id
const areaOf = (id: string): TodoArea =>
  /^(emi-|prem-|exp-|bud-)/.test(id) ? 'plan' : /^(fd-|mf-stale|st-stale)/.test(id) ? 'wealth' : 'money'
const iconOf = (id: string) =>
  id.startsWith('card-') ? '💳' : id.startsWith('emi-') ? '🏦' : /^(prem-|exp-)/.test(id) ? '🛡️' : id.startsWith('fd-') ? '🏛️'
    : id.startsWith('bud-') ? '📊' : id === 'util' ? '💳' : id.startsWith('quiet-') ? '📄' : /stale/.test(id) ? '⏱️' : '•'

export function buildTodo(inp: TodoInput): TodoItem[] {
  const { today, fx } = inp
  const out: TodoItem[] = []

  if (inp.confirm > 0) out.push({ id: 'confirm', group: 'today', area: 'money', icon: '✓', action: 'Confirm', href: '/dashboard/todo#confirm',
    title: `${inp.confirm} automatic entr${inp.confirm === 1 ? 'y' : 'ies'} waiting for your OK`, detail: 'Repeating entries, EMIs and SIPs whose day has come' })

  // Home's attention items, over both countries (uncategorised is covered by Review below)
  const ins = buildHomeInsights({ view: 'consolidated', fx, today, focusMonth: today.slice(0, 7), txns: inp.txns, accounts: inp.accounts, loans: inp.loans,
    insurance: inp.insurance, fixedDeposits: inp.fixedDeposits, budgets: inp.budgets, mutualFunds: inp.mutualFunds, stocks: inp.stocks, cash: 0, invested: { value: 0, cost: 0 } })
  for (const a of ins.attention.filter(a => a.id !== 'uncat'))
    out.push({ id: a.id, group: SEV[a.severity], area: areaOf(a.id), icon: iconOf(a.id), title: a.title, detail: a.detail,
      href: a.href ?? '/dashboard/money', action: a.actionLabel ?? 'See it', upload: a.action === 'upload' })

  // Accounts that run short of what's due from them, and bills with no account to pay them
  const dues = buildDues({ today, days: 14, view: 'consolidated', txns: inp.txns, accounts: inp.accounts, loans: inp.loans, insurance: inp.insurance,
    mutualFunds: inp.mutualFunds, recurring: inp.recurring, rds: inp.rds, plans: inp.plans, lic: inp.lic, bills: inp.bills, answers: inp.answers })
  const incoming = expectedIncome(inp.txns, inp.accounts, today, 35)
  for (const w of balanceWarnings(inp.accounts, dues, incoming, today, 14))
    out.push({ id: w.id, group: daysBetween(today, w.date ?? today) <= 3 ? 'today' : 'week', area: 'money', icon: '⚠️', title: w.title, detail: w.detail, href: w.href ?? '/dashboard/accounts', action: 'Fix it' })
  for (const d of dues.filter(d => !d.payFrom && (d.kind === 'emi' || d.kind === 'card') && daysBetween(today, d.date) <= 7))
    out.push({ id: `payfrom-${d.id}`, group: 'week', area: 'money', icon: '🏦', title: `Which account pays ${d.label}?`, detail: 'Pick it once, and you’re warned if that account runs short',
      href: `/dashboard/money?payfrom=${encodeURIComponent(d.id)}`, action: 'Choose' })

  // Builder payments: your part, in time to have the money ready
  for (const b of inp.builder ?? []) {
    const d = daysBetween(today, b.date)
    const money = `${b.currency === 'AED' ? 'AED ' : '₹'}${Math.round(b.amount).toLocaleString(b.currency === 'AED' ? 'en-US' : 'en-IN')}`
    out.push({ id: b.id, group: d <= 2 ? 'today' : d <= 10 ? 'week' : 'later', area: 'plan', icon: '🏠', href: b.href, action: 'See it',
      title: `${money} for ${b.label} ${d <= 0 ? 'is due' : `due ${fmtDay(b.date)}`}`, detail: b.sub })
  }

  // Entries to review: missing account, vague category, possible duplicates
  const toReview = reviewCount(findReviewItems(inp.txns, { today, fx, accounts: inp.accounts }))
  if (toReview) out.push({ id: 'review', group: toReview >= 10 ? 'week' : 'later', area: 'money', icon: '🔍', href: '/dashboard/money/review', action: 'Review',
    title: `${toReview} transaction${toReview === 1 ? '' : 's'} to review`, detail: 'Missing “Paid from”, vague categories or possible duplicates' })

  // Recurring goals: a date coming with money still to set aside, or one that's passed
  for (const g of inp.recGoals) {
    const value = Math.max(0, inp.contributions.filter(c => c.goal_id === g.id).reduce((s, c) => s + (Number(c.amount) || 0), 0))
    const r = recurringState(g, value, inp.contributions, today)
    const money = (n: number) => `${g.currency === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString(g.currency === 'AED' ? 'en-US' : 'en-IN')}`
    if (r.status === 'short') out.push({ id: `goal-${g.id}`, group: r.days <= 7 ? 'week' : 'later', area: 'plan', icon: '🎯', href: `/dashboard/goals/${g.id}`, action: 'Set aside',
      title: `${g.name} ${r.days === 0 ? 'today' : r.days === 1 ? 'tomorrow' : `on ${fmtDay(addDays(today, r.days))}`}`, detail: `${money(r.left)} still to set aside — ${money(r.saved)} of ${money(Number(g.target_amount))} is ready` })
    else if (r.status === 'passed' && r.days >= -30) out.push({ id: `goal-${g.id}`, group: 'later', area: 'plan', icon: '🎯', href: `/dashboard/goals/${g.id}`, action: 'Record it',
      title: `${g.name} has passed`, detail: 'Record what you spent and start saving for the next one' })
  }

  // The portfolio manager's (premiums and maturities are already above, from Home)
  for (const n of inp.needs.filter(n => !/^(prem-|mat-)/.test(n.id)))
    out.push({ id: `pm-${n.id}`, group: n.tone === 'warn' || n.tone === 'good' ? 'week' : 'later', area: 'wealth',
      icon: n.icon, title: n.title, detail: n.detail, href: n.href, action: n.id === 'review' ? 'Open' : n.id === 'profile' ? 'Answer' : 'See it' })

  const RANK: Record<TodoGroup, number> = { today: 0, week: 1, later: 2 }
  return out.sort((a, b) => RANK[a.group] - RANK[b.group])
}
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }

// Snoozed and "not for me" items (kept on this device): id → the day it may come back
export const TODO_HIDE_KEY = 'wl-todo-hide'
export const visibleTodo = (items: TodoItem[], hidden: Record<string, string>, today: string) => items.filter(i => !(hidden[i.id] && hidden[i.id] > today))
