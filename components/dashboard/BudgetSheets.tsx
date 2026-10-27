'use client'
import { useMemo, useState } from 'react'
import { X, Lock, Sparkles, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { suggestCaps, budgetLabel, FIXED, type BudgetLine } from '@/lib/budgets'
import { Segmented } from '@/components/ui/kit'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { View } from '@/lib/money'

type Cur = 'AED' | 'INR'

// Save one category's cap for one currency and month. Found → update, else
// insert (works before migration 021's currency-aware unique index), and
// retried without is_manual before migration 009.
export async function writeBudget(supabase: any, row: { category: string; currency: Cur; monthly_cap: number; month_year: string; is_manual: boolean }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: { message: 'Signed out' } }
  const full = { ...row, user_id: user.id }
  const { data: existing } = await supabase.from('budgets').select('id').eq('user_id', user.id)
    .eq('category', row.category).eq('month_year', row.month_year).eq('currency', row.currency).maybeSingle()
  const run = (p: any) => existing ? supabase.from('budgets').update(p).eq('id', existing.id).select().single()
    : supabase.from('budgets').insert(p).select().single()
  let { data, error } = await run(full)
  if (error && /is_manual/.test(error.message || '')) { const { is_manual, ...base } = full; ({ data, error } = await run(base)) }
  if (error && /budgets_user_id_category_month_year_key|duplicate key/i.test(error.message || ''))
    error = { message: 'Run migration 021_budget_currency_unique.sql in Supabase so UAE and India budgets for the same category can live side by side.' }
  return { data, error }
}

function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="wl-sheet-panel w-full max-w-[480px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
            {sub && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Add or edit a budget: category, currency (All view), amount — with last
// months' spending to go on, and whether it stays fixed or adjusts itself.
export function BudgetSheet({ line, cats, txns, month, view, iconOf, colorOf, onClose, onSaved }: {
  line: BudgetLine | null; cats: string[]; txns: any[]; month: string; view: View
  iconOf: (c: string) => string; colorOf: (c: string) => string
  onClose: () => void; onSaved: (rows: any[], removedIds: string[]) => void
}) {
  const supabase = createClient()
  const fixedCur: Cur | null = view === 'uae' ? 'AED' : view === 'india' ? 'INR' : null
  const [category, setCategory] = useState(line?.category ?? '')
  const startCur: Cur = fixedCur ?? (line?.caps.AED != null && line?.caps.INR == null ? 'AED' : 'INR')
  const [cur, setCur] = useState<Cur>(startCur)
  const capOf = (c: Cur) => line?.caps[c] != null ? String(line.caps[c]) : ''
  const [amount, setAmount] = useState(capOf(startCur))
  const [keep, setKeep] = useState(line ? line.manual : true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sug = useMemo(() => suggestCaps(txns, cur, month), [txns, cur, month])
  const s = category ? sug[category] : undefined
  const sym = cur === 'AED' ? 'AED' : '₹'

  async function save() {
    const cap = Number(amount)
    if (!category) { setError('Pick a category.'); return }
    if (!(cap >= 0) || amount === '') { setError('Enter a monthly amount (0 or more).'); return }
    setBusy(true); setError('')
    const { data, error } = await writeBudget(supabase, { category, currency: cur, monthly_cap: cap, month_year: month, is_manual: keep })
    setBusy(false)
    if (error || !data) { setError(error?.message ?? 'Could not save'); return }
    onSaved([data], [])
  }
  async function remove() {
    if (!line) return
    setBusy(true); setError('')
    const ids = line.rows.filter(b => fixedCur ? (b.currency || 'INR') === fixedCur : true).map(b => b.id)
    const { error } = await supabase.from('budgets').delete().in('id', ids)
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved([], ids)
  }

  return (
    <Sheet title={line ? `${budgetLabel(line.category)} budget` : 'Add a budget'} sub={`For ${new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`} onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {!line && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Category</div>
            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
              {cats.map(c => (
                <button key={c} onClick={() => { setCategory(c); setError('') }} aria-pressed={category === c}
                  className="rounded-full pl-1.5 pr-3 h-[32px] text-[12.5px] font-medium flex items-center gap-1.5 transition-colors"
                  style={category === c ? { background: colorOf(c) + '1F', color: colorOf(c), border: `1.5px solid ${colorOf(c)}` } : { background: '#fff', color: 'var(--text2)', border: '1px solid var(--line)' }}>
                  <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: colorOf(c) + '1A', color: colorOf(c) }}><CategoryIcon icon={iconOf(c)} size={12} /></span>
                  {budgetLabel(c)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!fixedCur && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Money it covers</div>
            <Segmented label="Currency" value={cur} full onChange={(c: Cur) => { setCur(c); setAmount(capOf(c)) }}
              options={[{ value: 'INR', label: 'India · ₹' }, { value: 'AED', label: 'UAE · AED' }]} />
          </div>
        )}

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>Monthly budget</div>
          <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 48 }}>
            <span className="text-[15px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{sym}</span>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" autoFocus={!!line}
              aria-label="Monthly budget" className="flex-1 bg-transparent outline-none text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
          </div>
          {category && (
            s ? (
              <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: 'var(--text3)' }}>
                <span>{FIXED.has(category) ? 'Latest month' : 'Last 3 months: average'} {fmtMoney(FIXED.has(category) ? s.cap : s.avg, cur)} · highest {fmtMoney(s.max, cur)}</span>
                <button onClick={() => setAmount(String(s.cap))} className="rounded-full px-2.5 h-[26px] font-semibold flex items-center gap-1" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                  <Sparkles size={11} />Use {fmtMoney(s.cap, cur)}
                </button>
              </div>
            ) : <div className="mt-2 text-[12px]" style={{ color: 'var(--text4)' }}>No regular {cur === 'AED' ? 'AED' : '₹'} spending here in the last 3 months to go on.</div>
          )}
        </div>

        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
          <span><b style={{ color: 'var(--text)' }}><Lock size={12} className="inline -mt-0.5 mr-1" />Keep this amount every month</b><br />
            <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Untick to let it adjust itself each month from your recent spending.</span></span>
        </label>

        {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}

        <div className="flex gap-2.5">
          {line && (
            <button onClick={remove} disabled={busy} className="wl-btn disabled:opacity-60" style={{ height: 44, color: '#DC2626' }} aria-label="Delete budget"><Trash2 size={15} /></button>
          )}
          <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
          <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
            {busy ? 'Saving…' : line ? 'Save' : 'Add budget'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// Suggested budgets from the last 3 complete months, per currency — tick
// what to apply. Categories with a fixed (custom) amount are left alone.
export function SuggestSheet({ txns, budgets, month, view, onClose, onSaved }: {
  txns: any[]; budgets: any[]; month: string; view: View
  onClose: () => void; onSaved: (rows: any[]) => void
}) {
  const supabase = createClient()
  const curs: Cur[] = view === 'uae' ? ['AED'] : view === 'india' ? ['INR'] : ['INR', 'AED']
  const rows = curs.flatMap(cur => Object.entries(suggestCaps(txns, cur, month)).map(([category, s]) => {
    const now = budgets.find(b => b.month_year === month && b.category === category && (b.currency || 'INR') === cur)
    return { key: `${cur}|${category}`, cur, category, s, now, locked: !!now?.is_manual }
  })).sort((a, b) => Number(a.locked) - Number(b.locked) || b.s.cap - a.s.cap)
  const [pick, setPick] = useState<Set<string>>(() => new Set(rows.filter(r => !r.locked && Number(r.now?.monthly_cap) !== r.s.cap).map(r => r.key)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    setBusy(true); setError('')
    const saved: any[] = []
    for (const r of rows.filter(r => pick.has(r.key))) {
      const { data, error } = await writeBudget(supabase, { category: r.category, currency: r.cur, monthly_cap: r.s.cap, month_year: month, is_manual: false })
      if (error) { setError(error.message); break }
      if (data) saved.push(data)
    }
    setBusy(false)
    if (saved.length) onSaved(saved)
  }

  return (
    <Sheet title="Suggested budgets" sub="From your last 3 complete months · flexible costs +10%, fixed costs at their latest amount" onClose={onClose}>
      <div className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="text-[13px] py-6 text-center" style={{ color: 'var(--text3)' }}>Not enough spending yet — suggestions need a category in at least 2 of the last 3 months.</p>
        ) : (<>
          <ul>
            {rows.map(r => (
              <li key={r.key} style={{ borderTop: '1px solid #F1F5F9' }}>
                <label className={`flex items-center gap-3 py-2.5 ${r.locked ? 'opacity-55' : 'cursor-pointer'}`}>
                  <input type="checkbox" disabled={r.locked} checked={pick.has(r.key)} className="accent-[var(--accent)] w-4 h-4"
                    onChange={e => setPick(p => { const n = new Set(p); e.target.checked ? n.add(r.key) : n.delete(r.key); return n })} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(r.category)}
                      {curs.length > 1 && <span className="font-normal" style={{ color: 'var(--text4)' }}> · {r.cur === 'AED' ? 'UAE' : 'India'}</span>}</span>
                    <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>
                      {r.locked ? 'Fixed amount — not changed' : FIXED.has(r.category) ? 'Fixed cost · latest month' : `Average ${fmtMoney(r.s.avg, r.cur)} · ${r.s.months} of 3 months`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(r.s.cap, r.cur)}</span>
                    {r.now && <span className="block text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>now {fmtMoney(Number(r.now.monthly_cap), r.cur)}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error && <div className="rounded-lg px-3 py-2.5 mt-2 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
          <button onClick={apply} disabled={busy || pick.size === 0} className="wl-btn wl-btn-primary w-full mt-3 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
            <Sparkles size={14} />{busy ? 'Applying…' : `Apply ${pick.size} budget${pick.size === 1 ? '' : 's'}`}
          </button>
          <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>Applied budgets keep adjusting each month. Set one to a fixed amount from its row.</p>
        </>)}
      </div>
    </Sheet>
  )
}
