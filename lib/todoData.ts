// What the To do list reads (lib/todo), in one go: every holding and the last
// six months of entries (the portfolio manager's load), budgets, recurring
// goals and what's set aside for them, repeating entries, declared income and
// big bills. Automatic entries whose day has come are recorded alongside, as
// on Home and Money; the ones waiting for a yes or no are counted.
import { loadPortfolioData } from './portfolio/data'
import { buildPortfolio } from './portfolio/build'
import { withAutomation } from './automation'
import { buildBills, loadBillReads } from './bigBills'
import { buildTodo } from './todo'

export async function loadTodo(supabase: any, uid: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const since = new Date(); since.setUTCMonth(since.getUTCMonth() - 6)
  const opt = (q: any) => q.then((r: any) => r.data ?? [], () => [])
  const [auto, [d, budgets, recGoals, plans, [contribRes, skipsRes, held]]] = await withAutomation(supabase, uid, today, () => Promise.all([
    loadPortfolioData(supabase, uid, { txMonths: 6 }),
    opt(supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', since.toISOString().slice(0, 7))),
    opt(supabase.from('goals').select('*').eq('user_id', uid).not('repeat_months', 'is', null).eq('status', 'active')),
    opt(supabase.from('income_plans').select('*').eq('user_id', uid)),
    loadBillReads(supabase, uid),
  ]))
  const h = d.holdings
  const answers: string[] = (skipsRes.data ?? []).map((s: any) => s.key)
  const contributions = contribRes.data ?? []
  const bills = buildBills({ goals: recGoals, contributions, insurance: d.insurance, lic: h.lic ?? [], accounts: h.accounts, skips: answers, held }, today)
  const p = auto.pending
  const confirm = (p.recurring?.length ?? 0) + (p.emis?.length ?? 0) + (p.sips?.length ?? 0) + (p.drafts?.length ?? 0)
  const items = buildTodo({
    today, fx: d.fx, txns: d.transactions, accounts: h.accounts, loans: h.loans, insurance: d.insurance,
    stocks: h.stocks, mutualFunds: h.mutualFunds, fixedDeposits: h.fixedDeposits, rds: h.recurringDeposits, lic: h.lic ?? [],
    budgets, recurring: auto.recurring, plans, bills, answers, recGoals, contributions,
    needs: buildPortfolio(d).needs, confirm,
  })
  return { today, fx: d.fx, items, auto, txns: d.transactions, accounts: h.accounts, plans, bills, answers }
}
