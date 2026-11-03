// What the Plan pages read: everything Goals reads, plus budgets, repeating
// bills, declared income, your answers about bills, trips ahead and the
// pay-yourself-first setting. One round of reads, in parallel.
import { loadGoalsData } from './goalsData'
import { buildBills } from './bigBills'
import { isMissingTable } from './supabase/missingTable'
import { payFirstModeOf } from './plan'

export async function loadPlanData(supabase: any, uid: string) {
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 4)
  const budgetsFrom = start.toISOString().slice(0, 7)
  const [g, budgetsRes, recRes, plansRes, skipsRes, eventsRes, userRes] = await Promise.all([
    loadGoalsData(supabase, uid),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', budgetsFrom),
    supabase.from('recurring_txns').select('*').eq('user_id', uid),
    supabase.from('income_plans').select('*').eq('user_id', uid),
    supabase.from('big_bill_skips').select('key').eq('user_id', uid),
    supabase.from('spend_events').select('*').eq('user_id', uid).gte('end_date', new Date().toISOString().slice(0, 10)),
    supabase.auth.getUser(),
  ])
  const answers: string[] = (skipsRes.data ?? []).map((s: any) => s.key)
  const bills = buildBills({ goals: g.goals, contributions: g.contributions, insurance: g.insurance, lic: g.investments.lic_policies ?? [], accounts: g.accounts, skips: answers }, g.today)
  return {
    ...g,
    budgets: (budgetsRes.data ?? []) as any[],
    recurring: (recRes.data ?? []) as any[],
    plans: (plansRes.data ?? []) as any[],
    answers, answersReady: !isMissingTable(skipsRes.error),
    events: (eventsRes.data ?? []) as any[],
    bills,
    payFirst: payFirstModeOf(userRes.data?.user?.user_metadata),
  }
}
export type PlanData = Awaited<ReturnType<typeof loadPlanData>>
