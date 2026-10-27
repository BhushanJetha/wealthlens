'use client'
import { useState, useEffect, useRef } from 'react'
import { Bell, AlertTriangle, Clock, Shield, CheckCircle2, X, Gift } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { activeLoansWithEmi } from '@/lib/loans'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { budgetLines, spendByCategory, carryIn, budgetLabel, addMonths, FIXED } from '@/lib/budgets'
import { recurringState } from '@/lib/recurringGoals'

interface Notif {
  id: string
  type: 'budget' | 'emi' | 'insurance' | 'goal'
  severity: 'high' | 'medium' | 'low'
  title: string
  body: string
  href?: string
}

const ICONS = { budget: AlertTriangle, emi: Clock, insurance: Shield, goal: Gift }
const SEV_STYLE = {
  high:   { bg: 'var(--rose-bg)',  color: 'var(--rose)' },
  medium: { bg: 'var(--gold-bg)',  color: 'var(--gold)' },
  low:    { bg: 'var(--sage-bg)',  color: 'var(--sage)' },
}

// One load shared by every bell on the page (top bar, phone header, Home),
// reused for two minutes
let shared: { at: number; p: Promise<Notif[]> } | null = null
function loadNotifs(supabase: any): Promise<Notif[]> {
  if (shared && Date.now() - shared.at < 120000) return shared.p
  const p = (async (): Promise<Notif[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const now       = new Date()
    const today     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const thisMonth = today.slice(0, 7)
    const since     = addMonths(thisMonth, -6)

    const [txns, budgetRes, loanRes, insRes, recRes, contribRes] = await Promise.all([
      fetchAllRows((a, b) => supabase.from('transactions').select('*').eq('user_id', user.id).gte('txn_date', `${since}-01`).order('txn_date').order('id').range(a, b), 8),
      supabase.from('budgets').select('*').eq('user_id', user.id).gte('month_year', since),
      activeLoansWithEmi(supabase, user.id),
      supabase.from('insurance_policies').select('policy_name,expiry_date').eq('user_id', user.id).eq('is_active', true),
      // Recurring goals (migration 031) — empty before it
      supabase.from('goals').select('*').eq('user_id', user.id).not('repeat_months', 'is', null).eq('status', 'active'),
      supabase.from('goal_contributions').select('goal_id,amount,contrib_date').eq('user_id', user.id),
    ])

    const notifs: Notif[] = []

    // Budget alerts — UAE (AED) and India (₹) budgets each against their own spending
    const day = now.getDate(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    for (const cur of ['AED', 'INR'] as const) {
      const budgets = budgetRes.data ?? []
      const lines = budgetLines(budgets, spendByCategory(txns, thisMonth, cur), thisMonth, cur, { carry: carryIn(budgets, txns, thisMonth, cur) })
      const fmt = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')}`
      const where = cur === 'AED' ? 'UAE' : 'India'
      for (const l of lines) {
        const pct = Math.round(l.pct), name = `${budgetLabel(l.category)} (${where})`, fixed = FIXED.has(l.category)
        if (l.status === 'over') notifs.push({ id: `budget-${cur}-${l.category}`, type: 'budget', severity: 'high', href: '/dashboard/budgets',
          title: `${name} budget exceeded`, body: `${pct}% used — ${fmt(l.spent)} of ${fmt(l.cap)}` })
        else if (pct >= 80 && !fixed) notifs.push({ id: `budget-${cur}-${l.category}`, type: 'budget', severity: 'medium', href: '/dashboard/budgets',
          title: `${name} at ${pct}%`, body: `${fmt(l.left)} left for ${dim - day} day${dim - day === 1 ? '' : 's'}` })
        else if (!fixed && l.cap > 0 && pct > day / dim * 100 + 15 && l.spent - l.cap * day / dim > 0) notifs.push({ id: `budget-${cur}-${l.category}`, type: 'budget', severity: 'low', href: '/dashboard/budgets',
          title: `${name} is ahead of pace`, body: `${pct}% used by day ${day} of ${dim} — about ${fmt(l.spent - l.cap * day / dim)} more than expected` })
      }
    }

    // EMI reminders (due within 14 days)
    ;(loanRes.data ?? []).forEach((l: any) => {
      if (!l.next_emi_date) return
      const emiDate   = new Date(l.next_emi_date)
      const daysUntil = Math.round((emiDate.getTime() - now.getTime()) / 86400000)
      if (daysUntil >= 0 && daysUntil <= 14) {
        const sym  = l.currency === 'AED' ? 'AED ' : '₹'
        const when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`
        notifs.push({ id: `emi-${l.name}`, type: 'emi',
          severity: daysUntil <= 3 ? 'high' : 'medium',
          title: `EMI due ${when}`,
          body: `${l.name} — ${sym}${Number(l.emi_amount).toLocaleString('en-IN')}` })
      }
    })

    // Insurance expiring within 30 days
    ;(insRes.data ?? []).forEach((p: any) => {
      if (!p.expiry_date) return
      const expDate   = new Date(p.expiry_date)
      const daysUntil = Math.round((expDate.getTime() - now.getTime()) / 86400000)
      if (daysUntil >= 0 && daysUntil <= 30) {
        notifs.push({ id: `ins-${p.policy_name}`, type: 'insurance',
          severity: daysUntil <= 7 ? 'high' : 'low',
          title: `Insurance expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
          body: p.policy_name })
      }
    })

    // Recurring goals: a date coming up with money still to set aside, a date
    // that's passed (start the next round), and this month's set-asides
    const contribs = (contribRes.data ?? []) as any[]
    const todo: Record<string, number> = {}
    for (const g of (recRes.data ?? []) as any[]) {
      const cur = g.currency === 'AED' ? 'AED' : 'INR'
      const fmt = (n: number) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(n).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')}`
      const value = Math.max(0, contribs.filter(c => c.goal_id === g.id).reduce((s, c) => s + (Number(c.amount) || 0), 0))
      const r = recurringState(g, value, contribs, today)
      const when = r.days === 0 ? 'today' : r.days === 1 ? 'tomorrow' : `in ${r.days} days`
      if (r.status === 'short') notifs.push({ id: `goal-${g.id}`, type: 'goal', severity: r.days <= 7 ? 'high' : 'medium', href: `/dashboard/goals/${g.id}`,
        title: `${g.name} ${when}`, body: `${fmt(r.left)} still to set aside — ${fmt(r.saved)} of ${fmt(Number(g.target_amount))} is ready` })
      else if (r.status === 'passed' && r.days >= -30) notifs.push({ id: `goal-${g.id}`, type: 'goal', severity: 'low', href: `/dashboard/goals/${g.id}`,
        title: `${g.name} has passed`, body: 'Record what you spent and start saving for the next one' })
      else if ((r.status === 'todo' || r.status === 'new') && r.monthly > 0) todo[cur] = (todo[cur] ?? 0) + r.monthly
    }
    if (day >= 5) for (const [cur, amt] of Object.entries(todo)) notifs.push({ id: `goal-month-${cur}`, type: 'goal', severity: 'low', href: '/dashboard/goals',
      title: `Set aside ${cur === 'AED' ? 'AED ' : '₹'}${Math.round(amt).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')} this month`, body: `For your ${cur === 'AED' ? 'UAE' : 'India'} festivals and yearly costs` })

    notifs.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]))
    return notifs
  })().catch(() => [] as Notif[])
  shared = { at: Date.now(), p }
  return p
}

// `round`: the phone design's 36px circle button
export default function NotificationsPanel({ round }: { round?: boolean }) {
  const [open, setOpen]     = useState(false)
  const [items, setItems]   = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Loaded once when the page opens, so the bell's count is real
  useEffect(() => {
    if (fetched) return
    setLoading(true)
    loadNotifs(supabase).then(n => { setItems(n); setFetched(true); setLoading(false) })
  }, [fetched]) // eslint-disable-line react-hooks/exhaustive-deps

  const highCount = items.filter(n => n.severity === 'high').length

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-label="Notifications" aria-expanded={open}
        className={`relative flex items-center justify-center flex-shrink-0 transition-colors ${round ? 'w-9 h-9 rounded-full' : 'w-[34px] h-[34px] rounded-lg'}`}
        style={{ background: open ? 'var(--accent-bg)' : '#fff', border: '1px solid var(--border)', color: open ? 'var(--accent)' : 'var(--text2)' }}>
        <Bell size={16} />
        {fetched && items.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ background: highCount > 0 ? 'var(--rose)' : 'var(--gold)' }}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        ) : (
          <span className={`absolute rounded-full w-[7px] h-[7px] ${round ? 'top-[7px] right-2' : 'top-1.5 right-[7px]'}`} style={{ background: 'var(--rose)' }} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] rounded-xl z-50 overflow-hidden max-md:fixed max-md:left-3 max-md:right-3 max-md:top-16 max-md:mt-0 max-md:w-auto"
          style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.14)' }}>

          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Notifications</div>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                {loading ? 'Loading…' : items.length === 0 ? 'No alerts' : `${items.length} alert${items.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button onClick={() => setItems([])} className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                  style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                  Clear all
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ color: 'var(--text3)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--sage)' }} />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10">
                <CheckCircle2 size={28} style={{ color: 'var(--sage)' }} />
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>All clear!</div>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>No active alerts right now</div>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {items.map(n => {
                  const Icon = ICONS[n.type]
                  const s    = SEV_STYLE[n.severity]
                  const Row = n.href ? Link : 'div'
                  return (
                    <Row key={n.id} href={n.href as string} onClick={() => n.href && setOpen(false)} className="flex gap-3 p-3 rounded-xl" style={{ background: s.bg }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: s.color + '22', color: s.color }}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{n.title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{n.body}</div>
                      </div>
                    </Row>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
