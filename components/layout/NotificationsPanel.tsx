'use client'
import { useState, useEffect, useRef } from 'react'
import { Bell, AlertTriangle, Clock, Shield, CheckCircle2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notif {
  id: string
  type: 'budget' | 'emi' | 'insurance'
  severity: 'high' | 'medium' | 'low'
  title: string
  body: string
}

const ICONS = { budget: AlertTriangle, emi: Clock, insurance: Shield }
const SEV_STYLE = {
  high:   { bg: 'var(--rose-bg)',  color: 'var(--rose)' },
  medium: { bg: 'var(--gold-bg)',  color: 'var(--gold)' },
  low:    { bg: 'var(--sage-bg)',  color: 'var(--sage)' },
}

export default function NotificationsPanel() {
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

  useEffect(() => {
    if (!open || fetched) return
    setLoading(true)
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const now       = new Date()
      const thisMonth = now.toISOString().slice(0, 7)

      const [txnRes, budgetRes, loanRes, insRes] = await Promise.all([
        supabase.from('transactions').select('category,amount,currency').eq('user_id', user.id).gte('txn_date', `${thisMonth}-01`),
        supabase.from('budgets').select('*').eq('user_id', user.id),
        supabase.from('home_loans').select('name,emi_amount,next_emi_date,currency').eq('user_id', user.id).eq('is_active', true),
        supabase.from('insurance_policies').select('policy_name,expiry_date').eq('user_id', user.id).eq('is_active', true),
      ])

      const notifs: Notif[] = []
      const FX = 22.80

      // Budget alerts
      const catSpend: Record<string, number> = {}
      ;(txnRes.data ?? []).forEach(t => {
        const amt = t.currency === 'AED' ? Number(t.amount) * FX : Number(t.amount)
        catSpend[t.category] = (catSpend[t.category] ?? 0) + amt
      })
      ;(budgetRes.data ?? []).forEach(b => {
        const spent = catSpend[b.category] ?? 0
        const pct   = Number(b.monthly_cap) > 0 ? Math.round(spent / Number(b.monthly_cap) * 100) : 0
        if (pct >= 100) {
          notifs.push({ id: `budget-${b.id}`, type: 'budget', severity: 'high',
            title: `${b.category} budget exceeded`,
            body: `${pct}% used — ₹${Math.round(spent).toLocaleString('en-IN')} of ₹${Number(b.monthly_cap).toLocaleString('en-IN')}` })
        } else if (pct >= 80) {
          notifs.push({ id: `budget-${b.id}`, type: 'budget', severity: 'medium',
            title: `${b.category} at ${pct}%`,
            body: `₹${Math.round(Number(b.monthly_cap) - spent).toLocaleString('en-IN')} remaining this month` })
        }
      })

      // EMI reminders (due within 14 days)
      ;(loanRes.data ?? []).forEach(l => {
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
      ;(insRes.data ?? []).forEach(p => {
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

      notifs.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]))
      setItems(notifs)
      setFetched(true)
      setLoading(false)
    })()
  }, [open, fetched])

  const highCount = items.filter(n => n.severity === 'high').length

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-1.5 rounded-lg transition-all"
        style={{ color: open ? 'var(--sage)' : 'var(--text3)', background: open ? 'var(--sage-bg)' : 'transparent' }}>
        <Bell size={16} />
        {fetched && items.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
            style={{ background: highCount > 0 ? 'var(--rose)' : 'var(--gold)' }}>
            {items.length > 9 ? '9+' : items.length}
          </span>
        ) : (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style={{ background: 'var(--rose)' }} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] rounded-xl z-50 overflow-hidden"
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
                  return (
                    <div key={n.id} className="flex gap-3 p-3 rounded-xl" style={{ background: s.bg }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: s.color + '22', color: s.color }}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{n.title}</div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>{n.body}</div>
                      </div>
                    </div>
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
