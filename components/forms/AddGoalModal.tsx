'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { shouldAutoLink } from '@/lib/goalMatching'

const CATEGORIES = [
  { value: 'equity',       label: 'Equity / Stocks',  icon: '📈' },
  { value: 'mutual_fund',  label: 'Mutual Funds',      icon: '💹' },
  { value: 'fixed_income', label: 'Fixed Income',      icon: '🏦' },
  { value: 'gold',         label: 'Gold',              icon: '🥇' },
  { value: 'real_estate',  label: 'Real Estate',       icon: '🏠' },
  { value: 'retirement',   label: 'Retirement',        icon: '🛡️' },
  { value: 'emergency',    label: 'Emergency Fund',    icon: '🚨' },
  { value: 'general',      label: 'General Savings',   icon: '🎯' },
]

const COLORS = ['#16A34A','#2563EB','#D97706','#7C3AED','#E11D48','#0891B2','#DB2777','#059669']
const ALL_INV_TYPES = ['stocks','mutual_funds','fixed_deposits','recurring_deposits','nps_accounts','lic_policies','gold_investments','bond_investments','etf_investments']

function getGoalTerm(targetDate: string): string {
  const months = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
  if (months <= 12) return 'Short Term (≤ 1yr)'
  if (months <= 36) return 'Mid Term (1–3yr)'
  return 'Long Term (3yr+)'
}
function getMonthsLeft(targetDate: string): number {
  return Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
}

interface Props {
  onClose: () => void
  editData?: any
  allInvestments?: Record<string, any[]>
}

export default function AddGoalModal({ onClose, editData, allInvestments }: Props) {
  const isEdit = !!editData
  const [form, setForm] = useState<Record<string, string>>({
    name:          editData?.name          ?? '',
    description:   editData?.description   ?? '',
    target_amount: editData?.target_amount ?? '',
    currency:      editData?.currency      ?? 'INR',
    target_date:   editData?.target_date   ?? '',
    category:      editData?.category      ?? 'general',
    color:         editData?.color         ?? '#16A34A',
    notes:         editData?.notes         ?? '',
  })
  const [touched, setTouch] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const touch = (key: string) => setTouch(p => ({ ...p, [key]: true }))
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(p => ({ ...p, [key]: e.target.value }))
    touch(key)
  }

  const fieldErr = (key: string, label: string) =>
    touched[key] && !form[key] ? `${label} is required` : ''

  const inp = (label: string, key: string, type2 = 'text', placeholder = '') => (
    <div>
      <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>{label} <span style={{ color: 'var(--rose)' }}>*</span></label>
      <input type={type2} value={form[key] ?? ''} onChange={f(key)} onBlur={() => touch(key)} placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none transition-colors"
        style={{
          background: 'var(--bg2)',
          border: `1px solid ${fieldErr(key, label) ? 'var(--rose)' : 'var(--border)'}`,
          color: 'var(--text)',
        }}
        onFocus={e => (e.target.style.borderColor = fieldErr(key, label) ? 'var(--rose)' : 'var(--sage)')}
      />
      {fieldErr(key, label) && (
        <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--rose)' }}>⚠ {fieldErr(key, label)}</p>
      )}
    </div>
  )

  // Calculate smart auto-link count
  const monthsLeft = form.target_date ? getMonthsLeft(form.target_date) : 0
  const smartLinkCount = allInvestments && form.target_date
    ? ALL_INV_TYPES.reduce((cnt, type) =>
        cnt + (allInvestments[type] ?? []).filter(rec => shouldAutoLink(type, rec, form.category, monthsLeft)).length
      , 0)
    : 0

  async function save() {
    const required = { name: 'Goal Name', target_amount: 'Target Amount', target_date: 'Target Date' }
    const newTouched: Record<string, boolean> = {}
    let hasErr = false
    Object.entries(required).forEach(([k]) => { newTouched[k] = true; if (!form[k]) hasErr = true })
    setTouch(p => ({ ...p, ...newTouched }))
    if (hasErr) return

    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const catIcon = CATEGORIES.find(c => c.value === form.category)?.icon ?? '🎯'

    const payload: Record<string, any> = {
      name:          form.name,
      description:   form.description || null,
      target_amount: Number(form.target_amount),
      currency:      form.currency,
      country:       form.currency === 'AED' ? 'UAE' : 'India',  // goals table has NOT NULL country
      target_date:   form.target_date,
      category:      form.category,
      color:         form.color,
      icon:          catIcon,
      notes:         form.notes || null,
      updated_at:    new Date().toISOString(),
    }

    if (isEdit && editData?.id) {
      const { error: err } = await supabase.from('goals').update(payload).eq('id', editData.id)
      if (err) { setError(err.message); setSaving(false); return }
      router.refresh()
      setSaving(false)
      onClose()
      return
    }

    // Create new goal
    const { data: newGoal, error: insertErr } = await supabase
      .from('goals')
      .insert({ ...payload, status: 'active', user_id: user!.id })
      .select()
      .single()

    if (insertErr || !newGoal) {
      setError(insertErr?.message ?? 'Failed to create goal. Make sure you have run the 007_goals_v2.sql migration.')
      setSaving(false)
      return
    }

    // Smart auto-link investments — only the same country/currency as the goal
    // (an India/INR goal must not pull in UAE/AED investments, and vice-versa)
    if (allInvestments && form.target_date) {
      const ml = getMonthsLeft(form.target_date)
      const links: any[] = []
      ALL_INV_TYPES.forEach(type => {
        ;(allInvestments[type] ?? []).forEach((rec: any) => {
          if ((rec.currency ?? 'INR') !== form.currency) return
          if (shouldAutoLink(type, rec, form.category, ml)) {
            links.push({ goal_id: newGoal.id, user_id: user!.id, investment_type: type, investment_id: rec.id, allocation_pct: 100 })
          }
        })
      })
      if (links.length > 0) await supabase.from('goal_investments').insert(links)
    }

    setSaving(false)
    onClose()
    router.push(`/dashboard/goals/${newGoal.id}`)
  }

  const selectedCat = CATEGORIES.find(c => c.value === form.category)
  const termLabel = form.target_date ? getGoalTerm(form.target_date) : null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div className="wl-card p-6 w-full max-w-md">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm"
                style={{ background: form.color }}>
                {selectedCat?.icon ?? '🎯'}
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                {isEdit ? 'Edit Goal' : 'New Goal'}
              </h2>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={18} /></button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg text-[11px] font-medium" style={{ background: 'var(--rose-bg)', color: 'var(--rose)', border: '1px solid var(--rose)' }}>
              {error}
            </div>
          )}

          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>
                Goal Name <span style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input value={form.name} onChange={f('name')} onBlur={() => touch('name')} placeholder="e.g. Reach ₹10L in Equity by 2027"
                className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg2)', border: `1px solid ${touched.name && !form.name ? 'var(--rose)' : 'var(--border)'}`, color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = touched.name && !form.name ? 'var(--rose)' : 'var(--sage)')}
              />
              {touched.name && !form.name && <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--rose)' }}>⚠ Goal Name is required</p>}
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>Category</label>
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((cat, idx) => (
                  <button key={cat.value} onClick={() => setForm(p => ({ ...p, category: cat.value, color: COLORS[idx] }))}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] font-medium transition-all"
                    style={{
                      border: form.category === cat.value ? `2px solid ${form.color}` : '1px solid var(--border)',
                      background: form.category === cat.value ? `${form.color}15` : 'var(--bg2)',
                      color: form.category === cat.value ? form.color : 'var(--text3)',
                    }}>
                    <span className="text-base">{cat.icon}</span>
                    <span className="leading-tight text-center">{cat.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Amount + Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>
                  Target Amount <span style={{ color: 'var(--rose)' }}>*</span>
                </label>
                <input type="number" value={form.target_amount} onChange={f('target_amount')} onBlur={() => touch('target_amount')} placeholder="1000000"
                  className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                  style={{ background: 'var(--bg2)', border: `1px solid ${touched.target_amount && !form.target_amount ? 'var(--rose)' : 'var(--border)'}`, color: 'var(--text)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                />
                {touched.target_amount && !form.target_amount && <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--rose)' }}>⚠ Required</p>}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>Currency</label>
                <select value={form.currency} onChange={f('currency')}
                  className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="INR">INR 🇮🇳</option>
                  <option value="AED">AED 🇦🇪</option>
                </select>
              </div>
            </div>

            {/* Target Date */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>
                Target Date <span style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input type="date" value={form.target_date} onChange={f('target_date')} onBlur={() => touch('target_date')}
                className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg2)', border: `1px solid ${touched.target_date && !form.target_date ? 'var(--rose)' : 'var(--border)'}`, color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              />
              {touched.target_date && !form.target_date && <p className="text-[10px] mt-1 font-medium" style={{ color: 'var(--rose)' }}>⚠ Required</p>}
              {termLabel && (
                <div className="mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block"
                  style={{
                    background: termLabel.startsWith('Short') ? 'var(--gold-bg)' : termLabel.startsWith('Mid') ? 'var(--blue-bg)' : 'var(--sage-bg)',
                    color: termLabel.startsWith('Short') ? 'var(--gold)' : termLabel.startsWith('Mid') ? 'var(--blue)' : 'var(--sage)',
                  }}>
                  {termLabel}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-1 font-semibold" style={{ color: 'var(--text3)' }}>Description (optional)</label>
              <textarea value={form.description} onChange={f('description')} rows={2} placeholder="Why is this goal important to you?"
                className="w-full rounded-lg px-3 py-2 text-[12px] focus:outline-none resize-none"
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Color */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text3)' }}>Color</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                    className="w-6 h-6 rounded-full"
                    style={{ background: c, transform: form.color === c ? 'scale(1.3)' : 'scale(1)', outline: form.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            </div>

            {/* Smart auto-link notice */}
            {!isEdit && form.target_date && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px]"
                style={{ background: smartLinkCount > 0 ? 'var(--sage-bg)' : 'var(--bg2)', border: `1px solid ${smartLinkCount > 0 ? 'var(--income)' : 'var(--border)'}` }}>
                <span className="text-base flex-shrink-0">{smartLinkCount > 0 ? '🔗' : 'ℹ️'}</span>
                {smartLinkCount > 0
                  ? <span style={{ color: 'var(--sage)' }}><strong>{smartLinkCount} investment{smartLinkCount !== 1 ? 's' : ''}</strong> smart-matched for this goal based on category &amp; time horizon.</span>
                  : <span style={{ color: 'var(--text3)' }}>No existing investments match this goal&apos;s profile. You can link them manually after creation.</span>
                }
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-[12px] font-semibold"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>Cancel</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: form.color }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> {isEdit ? 'Save Changes' : 'Create Goal'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
