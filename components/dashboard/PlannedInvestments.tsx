'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sipsOf } from '@/lib/sips'
import { fmtMoney } from '@/lib/format'
import { toast } from '@/components/ui/toaster'

type Cur = 'AED' | 'INR'
type Row = { key: string; name: string; sub: string; amount: number; href: string }
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 10 > 3 || [11, 12, 13].includes(n % 100)) ? 0 : n % 10]}`

// What goes into investments every month: each SIP and each RD, the total per
// currency (dirhams and rupees never added together), and how it compares
// with this month's Investment budget — one tap makes the budget match.
export default function PlannedInvestments({ funds, rds, budgets, month, className = '' }: {
  funds: any[]; rds: any[]; budgets: any[]; month: string; className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<Cur | null>(null)
  const curs: Cur[] = ['INR', 'AED']
  const plan = curs.map(cur => {
    const sips: Row[] = funds.filter(f => (f.currency ?? 'INR') === cur).flatMap(f => sipsOf(f).map(s => ({
      key: `${f.id}-${s.id}`, name: f.fund_name, sub: `on the ${ordinal(s.day)}${s.note ? ` · ${s.note}` : ''}`, amount: Number(s.amount), href: `/dashboard/investments/h/mutual_funds/${f.id}` })))
    const rdRows: Row[] = rds.filter(r => (r.currency ?? 'INR') === cur && r.is_active !== false && Number(r.monthly_amount) > 0
      && (!r.start_date || String(r.start_date).slice(0, 7) <= month) && (!r.maturity_date || String(r.maturity_date).slice(0, 7) >= month))
      .map(r => ({ key: r.id, name: r.name, sub: [r.bank_name, r.start_date ? `on the ${ordinal(Number(String(r.start_date).slice(8, 10)) || 1)}` : null].filter(Boolean).join(' · '),
        amount: Number(r.monthly_amount), href: `/dashboard/investments/h/recurring_deposits/${r.id}` }))
    const total = [...sips, ...rdRows].reduce((a, x) => a + x.amount, 0)
    const budget = budgets.filter(b => b.category === 'Investment' && (b.currency || 'INR') === cur && b.month_year === month && !b.holder_name)
    return { cur, sips, rds: rdRows, total, budget: budget.length ? budget.reduce((a, b) => a + (Number(b.monthly_cap) || 0), 0) : null, budgetRow: budget[0] ?? null }
  }).filter(p => p.total > 0 || p.budget)

  async function matchBudget(p: typeof plan[number]) {
    setBusy(p.cur)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const res = p.budgetRow
      ? await sb.from('budgets').update({ monthly_cap: p.total, is_manual: true }).eq('id', p.budgetRow.id)
      : user ? await sb.from('budgets').insert({ user_id: user.id, category: 'Investment', currency: p.cur, month_year: month, monthly_cap: p.total, is_manual: true }) : { error: { message: 'Please sign in again.' } }
    setBusy(null)
    if (res.error) { toast(res.error.message, 'error'); return }
    toast(`Investment budget set to ${fmtMoney(p.total, p.cur)} for this month`); router.refresh()
  }

  if (!plan.length) return null
  const group = (title: string, rows: Row[], cur: Cur) => rows.length > 0 && (
    <div className="flex flex-col">
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-[0.05em] pb-1" style={{ color: 'var(--text3)' }}>
        <span>{title}</span><span className="tabular-nums">{fmtMoney(rows.reduce((a, r) => a + r.amount, 0), cur)}</span>
      </div>
      {rows.map((r, i) => (
        <Link key={r.key} href={r.href} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px] hover:bg-[var(--bg2)] rounded-md -mx-1 px-1" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
          <span className="min-w-0"><span className="block truncate font-medium" style={{ color: 'var(--text)' }}>{r.name}</span><span className="block truncate text-[11.5px]" style={{ color: 'var(--text4)' }}>{r.sub}</span></span>
          <b className="tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmtMoney(r.amount, cur)}</b>
        </Link>
      ))}
    </div>
  )

  return (
    <section className={`wl-card px-4 md:px-5 py-4 flex flex-col gap-3.5 ${className}`} aria-label="Planned every month">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}><CalendarClock size={15} /></span>
        <div><h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Planned every month</h2>
          <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Your SIPs and RDs — keep this much ready in the accounts they’re paid from</div></div>
      </div>
      {plan.map(p => {
        const diff = p.budget == null ? null : p.budget - p.total
        return (
          <div key={p.cur} className="flex flex-col gap-2.5">
            {group('Mutual fund SIPs', p.sips, p.cur)}
            {group('Recurring deposits', p.rds, p.cur)}
            <div className="flex items-center justify-between gap-3 pt-2" style={{ borderTop: '1.5px solid var(--line)' }}>
              <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Every month{plan.length > 1 ? ` · ${p.cur}` : ''}</span>
              <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(p.total, p.cur)}</span>
            </div>
            <div className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap text-[12.5px]"
              style={diff === 0 ? { background: '#F0FAF4', border: '1px solid #CDEBDC', color: '#1E4D38' } : { background: '#FAFAFE', border: '1px solid var(--line)', color: 'var(--text2)' }}>
              <span className="min-w-0">
                {p.budget == null ? <>No Investment budget for this month yet.</>
                  : diff === 0 ? <span className="inline-flex items-center gap-1"><Check size={13} />Matches your Investment budget ({fmtMoney(p.budget, p.cur)}).</span>
                  : <>Your Investment budget is {fmtMoney(p.budget, p.cur)} — {fmtMoney(Math.abs(diff!), p.cur)} {diff! > 0 ? 'more than' : 'less than'} what’s planned.</>}
              </span>
              {diff !== 0 && p.total > 0 && (
                <button onClick={() => matchBudget(p)} disabled={busy === p.cur} className="wl-btn flex-shrink-0" style={{ height: 32, fontSize: 12.5 }}>
                  {busy === p.cur ? <Loader2 size={13} className="animate-spin" /> : null}Set it to {fmtMoney(p.total, p.cur)}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
