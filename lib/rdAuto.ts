// RD instalments (migration 037): on the day each month the instalment enters
// your transactions as an investment. The RD's value already grows by date
// (lib/netWorth), so this is the money leaving your account. A debit in your
// statement ticks the month off instead; a month is never entered twice.
import { ymOf, addMonths, daysBetween } from './insights'
import { dateIn, autoTag } from './recurring'
import { catOf } from './money'

export interface RdDue { rd: any; month: string; date: string; amount: number }

export function dueRds(rds: any[], today: string): RdDue[] {
  const now = ymOf(today), out: RdDue[] = []
  for (const r of rds) {
    const amount = Number(r.monthly_amount) || 0, start = String(r.start_date ?? '').slice(0, 10)
    if (r.is_active === false || !start || amount <= 0 || !('rd_last_month' in r)) continue
    const day = Number(start.slice(8, 10))
    for (const m of r.rd_last_month ? [addMonths(now, -1), now] : [now]) {
      if (r.rd_last_month && m <= r.rd_last_month) continue
      const date = dateIn(m, day)
      if (date > today || date < start) continue
      if (r.maturity_date && date > String(r.maturity_date).slice(0, 10)) continue
      out.push({ rd: r, month: m, date, amount })
    }
  }
  return out
}

// The bank debit: an investment or RD payment, within a week, amount ±10%, naming it
export function rdInBank(d: RdDue, txns: any[]): any | null {
  const words = `${d.rd.name ?? ''} ${d.rd.bank_name ?? ''}`.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4)
  return txns.find(t => t.currency === d.rd.currency && t.txn_type !== 'income' && Math.abs(daysBetween(d.date, t.txn_date)) <= 7
    && Math.abs((Number(t.amount) || 0) - d.amount) <= d.amount * 0.1
    && (/\brd\b|recurring\s*deposit/i.test(`${t.merchant ?? ''} ${t.description ?? ''}`)
      || (catOf(t) === 'Investment' && words.some(w => `${t.merchant ?? ''} ${t.description ?? ''}`.toLowerCase().includes(w))))) ?? null
}

async function claim(supabase: any, r: any, month: string): Promise<boolean> {
  let q = supabase.from('recurring_deposits').update({ rd_last_month: month }).eq('id', r.id)
  q = r.rd_last_month ? q.eq('rd_last_month', r.rd_last_month) : q.is('rd_last_month', null)
  const { data, error } = await q.select('id')
  if (!error && data?.length) { r.rd_last_month = month; return true }
  return false
}

export async function runRds(supabase: any, userId: string, today: string, rds: any[], txns: any[]) {
  let writes = 0
  for (const d of dueRds(rds, today)) {
    const seen = rdInBank(d, txns)
    if (!(await claim(supabase, d.rd, d.month))) continue
    writes++
    if (seen) continue
    await supabase.from('transactions').insert({
      user_id: userId, txn_date: d.date, merchant: `${d.rd.name} RD`, description: `Monthly RD - ${d.rd.bank_name ?? d.rd.name}`, category: 'Investment', sub_category: 'RD',
      amount: d.amount, currency: d.rd.currency, country: d.rd.currency === 'AED' ? 'UAE' : 'India', txn_type: 'expense', account_id: d.rd.rd_account_id ?? null,
      source: 'manual', is_verified: true, ...autoTag({ kind: 'rd', id: d.rd.id, month: d.month, amount: d.amount }, !d.rd.rd_auto),
    })
  }
  return { writes }
}
