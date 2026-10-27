import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { markUnitemisedCardBills } from '@/lib/money'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import type { Fund } from '@/lib/budgets'
import BudgetsClient from '@/components/dashboard/BudgetsClient'

// Budgets: 13 months of transactions (this month, last year's history, and
// the 3 months the suggested caps look at), each month's own budgets, and
// yearly costs — the recurring goals (Diwali, premiums, fees…) from Goals.
// Before migration 031 they come from budget_funds (029).
export default async function BudgetsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, budgetsRes, cardsRes, recRes, contribRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    supabase.from('accounts').select('id').eq('user_id', uid).eq('account_type', 'credit_card'),
    supabase.from('goals').select('*').eq('user_id', uid).not('repeat_months', 'is', null).eq('status', 'active').order('target_date'),
    supabase.from('goal_contributions').select('goal_id,amount,contrib_date').eq('user_id', uid),
  ])

  let funds: Fund[] = [], fundsReady = true, fundsSource: 'goals' | 'funds' = 'goals'
  if (!recRes.error) {
    const recs = (recRes.data ?? []) as any[], contribs = (contribRes.data ?? []) as any[]
    // A goal kept in its own savings account counts that account's balance
    const accounts = recs.some(g => g.account_id) ? ((await activeAccountsWithLedger(supabase, uid, (await getAedInr()).rate)).data ?? []) : []
    funds = recs.map(g => {
      const cur = g.currency === 'AED' ? 'AED' : 'INR'
      const mine = contribs.filter(c => c.goal_id === g.id)
      const acc = g.account_id ? accounts.find((a: any) => a.id === g.account_id && a.currency === cur) : null
      const saved = Math.max(0, mine.reduce((s, c) => s + (Number(c.amount) || 0), 0) + (acc ? Math.max(0, Number(acc.current_balance) || 0) : 0))
      const used: Record<string, number> = {}
      for (const c of mine) if (Number(c.amount) < 0) used[String(c.contrib_date).slice(0, 7)] = (used[String(c.contrib_date).slice(0, 7)] ?? 0) - Number(c.amount)
      return {
        id: g.id, name: g.name, category: g.spend_category ?? null, currency: cur, target: Number(g.target_amount) || 0, due_date: String(g.target_date).slice(0, 10), saved,
        last_saved_month: mine.filter(c => Number(c.amount) > 0 && String(c.contrib_date) <= today).map(c => String(c.contrib_date).slice(0, 7)).sort().pop() ?? null,
        is_active: true, goal: g, used: Object.entries(used).map(([month, amount]) => ({ month, amount })),
      } as Fund
    })
  } else {
    const fundsRes = await supabase.from('budget_funds').select('*').eq('user_id', uid).eq('is_active', true).order('due_date')
    funds = fundsRes.data ?? []; fundsReady = !isMissingTable(fundsRes.error); fundsSource = 'funds'
  }

  // A card bill counts only when that month's card purchases weren't imported
  const cardIds = new Set((cardsRes.data ?? []).map((c: any) => c.id))
  return <BudgetsClient today={today} budgets={budgetsRes.data ?? []} transactions={markUnitemisedCardBills(txns, cardIds)}
    funds={funds} fundsReady={fundsReady} fundsSource={fundsSource} />
}
