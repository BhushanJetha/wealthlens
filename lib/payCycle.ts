// Salary that lands at the end of a month and pays for the next one. With the
// setting on (user_metadata.pay_cycle = { day }), a salary credit on or after
// that day counts in the next month's income (migration 050:
// transactions.counts_for_month) — so a month starts with the salary that pays
// for it, instead of looking short until the 30th. The bank still shows the
// money on the day it arrived; only monthly income, saved, budgets and plans
// read it as next month's (lib/money prepareMoney).
import { fetchAllRows } from './supabase/fetchAll'

export const PAY_CATS = new Set(['Salary', 'Allowances & reimbursements'])
export const payDayOf = (meta: any): number | null => { const d = Number(meta?.pay_cycle?.day); return d >= 15 && d <= 31 ? d : null }
const nextMonth = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }

// The month a credit counts for under the setting (null: its own month)
export function payMonthFor(t: any, day: number | null): string | null {
  if (!day || t?.txn_type !== 'income' || !PAY_CATS.has(String(t.category ?? '').trim())) return null
  const d = String(t.txn_date ?? '')
  return Number(d.slice(8, 10)) >= day ? nextMonth(d.slice(0, 7)) : null
}

// What your salary credits usually look like: the typical day, and whether
// they land late in the month (to suggest the setting)
export function salaryDays(txns: any[]): { day: number; lateShare: number; n: number } | null {
  const days = txns.filter(t => t.txn_type === 'income' && PAY_CATS.has(String(t.category ?? '').trim())).map(t => Number(String(t.txn_date).slice(8, 10))).filter(Boolean).sort((a, b) => a - b)
  if (days.length < 2) return null
  return { day: days[Math.floor(days.length / 2)], lateShare: days.filter(d => d >= 25).length / days.length, n: days.length }
}

// Put every salary credit in the month it counts for (or, with the setting
// off, back in its own month). Returns how many changed.
export async function applyPayCycle(supabase: any, userId: string, day: number | null, rows?: any[]): Promise<{ changed: number; error?: string }> {
  const list = rows ?? await fetchAllRows((a, b) => supabase.from('transactions').select('id,txn_date,txn_type,category,counts_for_month')
    .eq('user_id', userId).eq('txn_type', 'income').order('txn_date').order('id').range(a, b))
  const byTarget = new Map<string, string[]>()
  for (const t of list) {
    if (!('counts_for_month' in t)) return { changed: 0, error: 'Counting salary for the next month needs migration 050 (supabase/migrations/050_allotment_paymonth.sql). Run it in Supabase, then try again.' }
    const want = payMonthFor(t, day) ?? ''
    if ((t.counts_for_month ?? '') === want) continue
    ;(byTarget.get(want) ?? byTarget.set(want, []).get(want)!).push(t.id)
  }
  let changed = 0
  for (const [month, ids] of Array.from(byTarget.entries())) for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from('transactions').update({ counts_for_month: month || null }).in('id', ids.slice(i, i + 200))
    if (error) return { changed, error: error.message }
    changed += Math.min(200, ids.length - i)
  }
  return { changed }
}
