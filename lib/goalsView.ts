// Turns the loaded goals data (lib/goalsData) into what the pages show:
// each goal's value, pace and plan, and — per currency — what you save a
// month, your essentials, travel spend and bank & cash (for funding and ideas).
import { prepareMoney, catOf, isSpend } from './money'
import { monthMoney, addMonths } from './budgets'
import { goalValue, goalPace, goalPlan, kindOf, tracksCash, fundingPlan, type Ctx, type Cur, type Kind, type GoalValue, type Plan } from './goals'

export interface GoalItem { goal: any; kind: Kind; v: GoalValue; pace: number; plan: Plan }
export interface PerCur { essentials: number; income: number; saved: number }

function loanMonthsLeft(l: any): number | null {
  const bal = Number(l.outstanding_amt) || 0, emi = Number(l.emi_amount) || 0, r = (Number(l.interest_rate) || 0) / 1200
  if (bal <= 0 || emi <= 0 || emi <= bal * r) return null
  let b = bal, n = 0
  while (b > 0.5 && n < 600) { b = b * (1 + r) - emi; n++ }
  return n
}

export function buildGoals(d: {
  goals: any[]; links: any[]; contributions: any[]; invTxns: any[]; accounts: any[]; loans: any[]
  transactions: any[]; investments: Record<string, any[]>; fx: number
}, today: string) {
  const ctx: Ctx = { links: d.links, investments: d.investments, contributions: d.contributions, accounts: d.accounts, invTxns: d.invTxns, fx: d.fx }
  const items: GoalItem[] = d.goals.map(g => {
    const v = goalValue(g, ctx), pace = goalPace(g, ctx, today)
    return { goal: g, kind: kindOf(g), v, pace, plan: goalPlan(g, v.value, pace, today) }
  })

  // Per currency: last 3 complete months (that had any money)
  const prepared = prepareMoney(d.transactions, { fx: d.fx })
  const months = [1, 2, 3].map(i => addMonths(today.slice(0, 7), -i))
  const per = (c: Cur): PerCur => {
    const ms = months.map(m => monthMoney(prepared, m, c)).filter(x => x.income > 0 || x.spent > 0 || x.emi > 0)
    const avg = (f: (x: ReturnType<typeof monthMoney>) => number) => ms.length ? ms.reduce((a, x) => a + f(x), 0) / ms.length : 0
    return { essentials: avg(x => x.spent + x.emi), income: avg(x => x.income), saved: avg(x => x.saved) }
  }
  const monthly: Record<Cur, PerCur> = { AED: per('AED'), INR: per('INR') }

  // A goal on bank & cash (emergency fund) fills from your general saving:
  // its pace is the share the funding plan gives it (it's funded first)
  for (const c of ['AED', 'INR'] as Cur[]) {
    const mine = items.filter(it => it.goal.currency === c)
    if (!mine.some(it => tracksCash(it.goal))) continue
    const f = fundingPlan(mine.map(it => ({ goal: it.goal, value: it.v.value, plan: it.plan })), monthly[c].saved)
    for (const it of mine.filter(it => tracksCash(it.goal))) {
      const given = f.rows.find(r => r.goal.id === it.goal.id)?.given ?? 0
      it.pace = given
      it.plan = goalPlan(it.goal, it.v.value, given, today)
    }
  }
  const travel: Record<Cur, number> = { AED: 0, INR: 0 }
  for (const t of d.transactions) if (isSpend(t) && /travel|trip|flight|vacation|holiday|air ?ticket/i.test(catOf(t)) && (t.currency === 'AED' || t.currency === 'INR')) travel[t.currency as Cur] += Number(t.amount) || 0
  const cash: Record<Cur, number> = { AED: 0, INR: 0 }
  for (const a of d.accounts) if (a.account_type !== 'credit_card' && a.is_active !== false && (a.currency === 'AED' || a.currency === 'INR')) cash[a.currency as Cur] += Math.max(0, Number(a.current_balance) || 0)
  const loans = d.loans.map(l => ({ name: l.name, currency: l.currency, emi: Number(l.emi_amount) || 0, monthsLeft: loanMonthsLeft(l), type: l.loan_type }))

  // This month's income vs usual, per currency (for the "extra income" nudge)
  const thisMonth = today.slice(0, 7)
  const extra: Record<Cur, number> = { AED: 0, INR: 0 }
  for (const c of ['AED', 'INR'] as Cur[]) {
    const now = monthMoney(prepared, thisMonth, c).income, usual = monthly[c].income
    if (usual > 0 && now > usual * 1.25) extra[c] = now - usual
  }
  return { items, ctx, monthly, travel, cash, loans, extra }
}
