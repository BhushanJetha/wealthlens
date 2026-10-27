'use client'
import { useMemo, useState } from 'react'
import { X, Lock, Sparkles, Trash2, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { suggestCaps, budgetLabel, addMonths, FIXED, isReserved, SAVINGS, PERSON, type BudgetLine, type Cur, type Fund } from '@/lib/budgets'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

type Row = { category: string; currency: Cur; monthly_cap: number; month_year: string; is_manual: boolean; rollover?: boolean; holder_name?: string | null }
const OPTIONAL = ['rollover', 'holder_name', 'is_manual']
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// Save one budget row (category, currency, month — and person, for person
// budgets). Found → update, else insert. Columns from later migrations are
// dropped and the save retried if they don't exist yet.
export async function writeBudget(supabase: any, row: Row) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: { message: 'Signed out' } }
  const full: Record<string, any> = { ...row, user_id: user.id }
  if (full.holder_name === undefined) delete full.holder_name
  if (full.rollover === undefined) delete full.rollover
  let q = supabase.from('budgets').select('id').eq('user_id', user.id).eq('category', row.category).eq('month_year', row.month_year).eq('currency', row.currency)
  if (row.holder_name) q = q.eq('holder_name', row.holder_name)
  const { data: found } = await q.limit(1)
  const existing = found?.[0]
  const run = (p: any) => existing ? supabase.from('budgets').update(p).eq('id', existing.id).select().single()
    : supabase.from('budgets').insert(p).select().single()
  let { data, error } = await run(full)
  for (let i = 0; i < 3 && error; i++) {
    const col = OPTIONAL.find(c => c in full && String(error.message ?? '').includes(c))
    if (!col) break
    if (col === 'holder_name') return { data: null, error: { message: 'Run migration 029 in Supabase to set budgets per person.' } }
    delete full[col]; ({ data, error } = await run(full))
  }
  if (error && /duplicate key|unique/i.test(error.message || ''))
    error = { message: 'Run migration 029 in Supabase so UAE and India budgets (and per-person budgets) can sit side by side.' }
  return { data, error }
}

export function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="wl-sheet-panel w-full max-w-[500px] rounded-2xl overflow-y-auto"
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

const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
function Amount({ cur, value, onChange, autoFocus, label }: { cur: Cur; value: string; onChange: (v: string) => void; autoFocus?: boolean; label: string }) {
  return (
    <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 48 }}>
      <span className="text-[15px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
      <input value={value} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" autoFocus={autoFocus}
        aria-label={label} className="flex-1 bg-transparent outline-none text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
    </div>
  )
}
const Err = ({ msg }: { msg: string }) => msg ? <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{msg}</div> : null
function Buttons({ busy, label, onCancel, onSave, onDelete }: { busy: boolean; label: string; onCancel: () => void; onSave: () => void; onDelete?: () => void }) {
  return (
    <div className="flex gap-2.5">
      {onDelete && <button onClick={onDelete} disabled={busy} className="wl-btn disabled:opacity-60" style={{ height: 44, color: '#DC2626' }} aria-label="Delete"><Trash2 size={15} /></button>}
      <button onClick={onCancel} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
      <button onClick={onSave} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : label}</button>
    </div>
  )
}

// ── Category budget: add / edit ──────────────────────────────────────────────
export function BudgetSheet({ line, cur, cats, txns, month, iconOf, colorOf, onClose, onSaved }: {
  line: BudgetLine | null; cur: Cur; cats: string[]; txns: any[]; month: string
  iconOf: (c: string) => string; colorOf: (c: string) => string
  onClose: () => void; onSaved: (rows: any[], removedIds: string[]) => void
}) {
  const supabase = createClient()
  const [category, setCategory] = useState(line?.category ?? '')
  const [amount, setAmount] = useState(line ? String(line.base) : '')
  const [keep, setKeep] = useState(line ? line.manual : true)
  const [roll, setRoll] = useState(line?.rollover ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sug = useMemo(() => suggestCaps(txns, cur, month), [txns, cur, month])
  const s = category ? sug[category] : undefined
  const fixed = FIXED.has(category)

  async function save() {
    const cap = Number(amount)
    if (!category) { setError('Pick a category.'); return }
    if (!(cap >= 0) || amount === '') { setError('Enter a monthly amount (0 or more).'); return }
    setBusy(true); setError('')
    const { data, error } = await writeBudget(supabase, { category, currency: cur, monthly_cap: cap, month_year: month, is_manual: keep, rollover: fixed ? false : roll })
    setBusy(false)
    if (error || !data) { setError(error?.message ?? 'Could not save'); return }
    onSaved([data], [])
  }
  async function remove() {
    if (!line) return
    setBusy(true)
    const { error } = await supabase.from('budgets').delete().eq('id', line.row.id)
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved([], [line.row.id])
  }

  return (
    <Sheet title={line ? `${budgetLabel(line.category)} · ${cur === 'AED' ? 'UAE' : 'India'}` : `Add a ${cur === 'AED' ? 'UAE (AED)' : 'India (₹)'} budget`} sub={`For ${monthName(month)}`} onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {!line && (
          <div>
            <Label>Category</Label>
            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
              {cats.map(c => (
                <button key={c} onClick={() => { setCategory(c); setError(''); if (!amount && sug[c]) setAmount(String(sug[c].cap)) }} aria-pressed={category === c}
                  className="rounded-full pl-1.5 pr-3 h-[32px] text-[12.5px] font-medium flex items-center gap-1.5 transition-colors"
                  style={category === c ? { background: colorOf(c) + '1F', color: colorOf(c), border: `1.5px solid ${colorOf(c)}` } : { background: '#fff', color: 'var(--text2)', border: '1px solid var(--line)' }}>
                  <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: colorOf(c) + '1A', color: colorOf(c) }}><CategoryIcon icon={iconOf(c)} size={12} /></span>
                  {budgetLabel(c)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>Monthly budget</Label>
          <Amount cur={cur} value={amount} onChange={setAmount} autoFocus={!!line} label="Monthly budget" />
          {category && (s ? (
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[12px]" style={{ color: 'var(--text3)' }}>
              <span>{fixed ? 'Latest month' : 'Last 3 months: average'} {fmtMoney(fixed ? s.cap : s.avg, cur)} · highest {fmtMoney(s.max, cur)}</span>
              <button onClick={() => setAmount(String(s.cap))} className="rounded-full px-2.5 h-[26px] font-semibold flex items-center gap-1" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                <Sparkles size={11} />Use {fmtMoney(s.cap, cur)}
              </button>
            </div>
          ) : <div className="mt-2 text-[12px]" style={{ color: 'var(--text4)' }}>No regular {cur === 'AED' ? 'AED' : '₹'} spending here in the last 3 months to go on.</div>)}
        </div>
        <label className="flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
          <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
          <span><b style={{ color: 'var(--text)' }}><Lock size={12} className="inline -mt-0.5 mr-1" />Keep this amount every month</b><br />
            <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Untick to let it adjust itself each month from your recent spending.</span></span>
        </label>
        {!fixed && (
          <label className="flex items-start gap-2.5 text-[13px] cursor-pointer" style={{ color: 'var(--text2)' }}>
            <input type="checkbox" checked={roll} onChange={e => setRoll(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
            <span><b style={{ color: 'var(--text)' }}><Repeat size={12} className="inline -mt-0.5 mr-1" />Roll unspent money into next month</b><br />
              <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Spend less this month and next month's {category ? budgetLabel(category) : ''} budget grows by what's left.</span></span>
          </label>
        )}
        <Err msg={error} />
        <Buttons busy={busy} label={line ? 'Save' : 'Add budget'} onCancel={onClose} onSave={save} onDelete={line ? remove : undefined} />
      </div>
    </Sheet>
  )
}

// ── Suggestions (one currency) ───────────────────────────────────────────────
export function SuggestSheet({ cur, txns, budgets, month, onClose, onSaved }: {
  cur: Cur; txns: any[]; budgets: any[]; month: string; onClose: () => void; onSaved: (rows: any[]) => void
}) {
  const supabase = createClient()
  const rows = Object.entries(suggestCaps(txns, cur, month)).map(([category, s]) => {
    const now = budgets.find(b => b.month_year === month && b.category === category && (b.currency || 'INR') === cur)
    return { category, s, now, locked: !!now?.is_manual }
  }).sort((a, b) => Number(a.locked) - Number(b.locked) || b.s.cap - a.s.cap)
  const [pick, setPick] = useState<Set<string>>(() => new Set(rows.filter(r => !r.locked && Number(r.now?.monthly_cap) !== r.s.cap).map(r => r.category)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function apply() {
    setBusy(true); setError('')
    const saved: any[] = []
    for (const r of rows.filter(r => pick.has(r.category))) {
      const { data, error } = await writeBudget(supabase, { category: r.category, currency: cur, monthly_cap: r.s.cap, month_year: month, is_manual: false, rollover: r.now?.rollover ?? undefined })
      if (error) { setError(error.message); break }
      if (data) saved.push(data)
    }
    setBusy(false)
    if (saved.length) onSaved(saved)
  }

  return (
    <Sheet title={`Suggested ${cur === 'AED' ? 'UAE (AED)' : 'India (₹)'} budgets`} sub="From your last 3 complete months · flexible costs +10%, fixed costs at their latest amount" onClose={onClose}>
      <div className="px-5 pb-5">
        {rows.length === 0 ? (
          <p className="text-[13px] py-6 text-center" style={{ color: 'var(--text3)' }}>Not enough {cur === 'AED' ? 'AED' : '₹'} spending yet — suggestions need a category in at least 2 of the last 3 months.</p>
        ) : (<>
          <ul>
            {rows.map(r => (
              <li key={r.category} style={{ borderTop: '1px solid #F1F5F9' }}>
                <label className={`flex items-center gap-3 py-2.5 ${r.locked ? 'opacity-55' : 'cursor-pointer'}`}>
                  <input type="checkbox" disabled={r.locked} checked={pick.has(r.category)} className="accent-[var(--accent)] w-4 h-4"
                    onChange={e => setPick(p => { const n = new Set(p); e.target.checked ? n.add(r.category) : n.delete(r.category); return n })} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(r.category)}</span>
                    <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>
                      {r.locked ? 'Fixed amount — not changed' : FIXED.has(r.category) ? 'Fixed cost · latest month' : `Average ${fmtMoney(r.s.avg, cur)} · ${r.s.months} of 3 months`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(r.s.cap, cur)}</span>
                    {r.now && <span className="block text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>now {fmtMoney(Number(r.now.monthly_cap), cur)}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2"><Err msg={error} /></div>
          <button onClick={apply} disabled={busy || pick.size === 0} className="wl-btn wl-btn-primary w-full mt-3 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
            <Sparkles size={14} />{busy ? 'Applying…' : `Apply ${pick.size} budget${pick.size === 1 ? '' : 's'}`}
          </button>
          <p className="text-[11.5px] mt-2 leading-snug" style={{ color: 'var(--text4)' }}>Applied budgets keep adjusting each month. Set one to a fixed amount from its row. One-off costs like school fees work better as yearly costs.</p>
        </>)}
      </div>
    </Sheet>
  )
}

// ── Save first: a monthly saving target (row category '__savings__') ─────────
export function SavingsSheet({ cur, month, row, typical, onClose, onSaved }: {
  cur: Cur; month: string; row: any | null; typical: number; onClose: () => void; onSaved: (rows: any[], removed: string[]) => void
}) {
  const supabase = createClient()
  const [amount, setAmount] = useState(row ? String(row.monthly_cap) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    const v = Number(amount)
    if (!(v > 0)) { setError('Enter how much you want to save each month.'); return }
    setBusy(true); setError('')
    const { data, error } = await writeBudget(supabase, { category: SAVINGS, currency: cur, monthly_cap: v, month_year: month, is_manual: true })
    setBusy(false)
    if (error || !data) { setError(error?.message ?? 'Could not save'); return }
    onSaved([data], [])
  }
  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('budgets').delete().eq('id', row.id)
    setBusy(false)
    if (error) setError(error.message); else onSaved([], [row.id])
  }
  return (
    <Sheet title={`Save first · ${cur === 'AED' ? 'UAE' : 'India'}`} sub="Decide what you'll save before you plan the spending" onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div>
          <Label>Save each month</Label>
          <Amount cur={cur} value={amount} onChange={setAmount} autoFocus label="Monthly saving target" />
          {typical > 0 && <div className="mt-2 text-[12px]" style={{ color: 'var(--text3)' }}>
            You've saved about {fmtMoney(typical, cur)} a month lately (income − spending − EMIs; investing counts as saving).
            <button onClick={() => setAmount(String(Math.round(typical / (cur === 'AED' ? 10 : 100)) * (cur === 'AED' ? 10 : 100)))} className="ml-1.5 font-semibold" style={{ color: 'var(--accent)' }}>Use it</button></div>}
        </div>
        <Err msg={error} />
        <Buttons busy={busy} label="Save target" onCancel={onClose} onSave={save} onDelete={row ? remove : undefined} />
      </div>
    </Sheet>
  )
}

// ── Per-person budget (row category '__person__' + holder_name) ──────────────
export function PersonSheet({ cur, month, members, row, onClose, onSaved }: {
  cur: Cur; month: string; members: { value: string; label: string }[]; row: any | null
  onClose: () => void; onSaved: (rows: any[], removed: string[]) => void
}) {
  const supabase = createClient()
  const [who, setWho] = useState<string>(row?.holder_name ?? members[0]?.value ?? '')
  const [amount, setAmount] = useState(row ? String(row.monthly_cap) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    const v = Number(amount)
    if (!who) { setError('Pick a person.'); return }
    if (!(v >= 0) || amount === '') { setError('Enter a monthly amount.'); return }
    setBusy(true); setError('')
    const { data, error } = await writeBudget(supabase, { category: PERSON, currency: cur, monthly_cap: v, month_year: month, is_manual: true, holder_name: who })
    setBusy(false)
    if (error || !data) { setError(error?.message ?? 'Could not save'); return }
    onSaved([data], [])
  }
  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('budgets').delete().eq('id', row.id)
    setBusy(false)
    if (error) setError(error.message); else onSaved([], [row.id])
  }
  return (
    <Sheet title={row ? `Budget for ${members.find(m => m.value === row.holder_name)?.label ?? row.holder_name}` : 'Budget for a person'} sub="Everything spent for them — tag expenses with “For”" onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        {!row && (
          <div>
            <Label>Person</Label>
            <div className="flex flex-wrap gap-1.5">
              {members.map(m => (
                <button key={m.value} onClick={() => setWho(m.value)} aria-pressed={who === m.value} className="wl-chip" style={{ height: 32 }}>{m.label}</button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>Each month</Label>
          <Amount cur={cur} value={amount} onChange={setAmount} autoFocus={!!row} label="Monthly budget for this person" />
        </div>
        <Err msg={error} />
        <Buttons busy={busy} label="Save" onCancel={onClose} onSave={save} onDelete={row ? remove : undefined} />
      </div>
    </Sheet>
  )
}

// ── Yearly cost (budget_funds) ───────────────────────────────────────────────
export function FundSheet({ cur, fund, cats, onClose, onSaved }: {
  cur: Cur; fund: Fund | null; cats: string[]; onClose: () => void; onSaved: (f: Fund | null, removedId?: string) => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(fund?.name ?? '')
  const [category, setCategory] = useState(fund?.category ?? '')
  const [target, setTarget] = useState(fund ? String(fund.target) : '')
  const [saved, setSaved] = useState(fund ? String(fund.saved) : '0')
  const [due, setDue] = useState(fund?.due_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (!name.trim()) { setError('Name it — e.g. School fees, Car insurance, Diwali.'); return }
    if (!(Number(target) > 0)) { setError('Enter the yearly amount.'); return }
    if (!due) { setError('Pick when it’s due.'); return }
    setBusy(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const row = { name: name.trim(), category: category || null, currency: cur, target: Number(target), saved: Number(saved) || 0, due_date: due }
    const res = fund ? await supabase.from('budget_funds').update(row).eq('id', fund.id).select().single()
      : await supabase.from('budget_funds').insert({ ...row, user_id: user!.id }).select().single()
    setBusy(false)
    if (res.error) { setError(/budget_funds/.test(res.error.message) ? 'Run migration 029 in Supabase to add yearly costs.' : res.error.message); return }
    onSaved(res.data as Fund)
  }
  async function remove() {
    if (!fund) return
    setBusy(true)
    const { error } = await supabase.from('budget_funds').delete().eq('id', fund.id)
    setBusy(false)
    if (error) setError(error.message); else onSaved(null, fund.id)
  }
  return (
    <Sheet title={fund ? fund.name : `Add a yearly cost · ${cur === 'AED' ? 'UAE' : 'India'}`} sub="Put a share aside every month so it's all there when it's due" onClose={onClose}>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div>
          <Label>What for</Label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="School fees, car insurance, Diwali, flights home…" className="wl-input w-full" style={{ height: 44 }} autoFocus={!fund} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Amount</Label><Amount cur={cur} value={target} onChange={setTarget} label="Yearly amount" /></div>
          <div><Label>Due on</Label><input type="date" value={due} onChange={e => setDue(e.target.value)} className="wl-input w-full" style={{ height: 48 }} aria-label="Due date" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Already put aside</Label><Amount cur={cur} value={saved} onChange={setSaved} label="Already saved" /></div>
          <div>
            <Label>Paid from category</Label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="wl-input w-full" style={{ height: 48 }} aria-label="Category it covers">
              <option value="">—</option>
              {cats.filter(c => !isReserved(c)).map(c => <option key={c} value={c}>{budgetLabel(c)}</option>)}
            </select>
          </div>
        </div>
        <p className="text-[12px] -mt-1" style={{ color: 'var(--text4)' }}>In the month it's due, what you've put aside is added to that category's budget, so the big payment doesn't show as overspending.</p>
        <Err msg={error} />
        <Buttons busy={busy} label={fund ? 'Save' : 'Add yearly cost'} onCancel={onClose} onSave={save} onDelete={fund ? remove : undefined} />
      </div>
    </Sheet>
  )
}

// ── Month-end review: plan next month in one go ──────────────────────────────
export function PlanNextSheet({ cur, txns, budgets, month, lines, onClose, onSaved }: {
  cur: Cur; txns: any[]; budgets: any[]; month: string; lines: BudgetLine[]; onClose: () => void; onSaved: (rows: any[]) => void
}) {
  const supabase = createClient()
  const next = addMonths(month, 1)
  // Suggestions for next month count this month (nearly done) as the latest
  const sug = useMemo(() => suggestCaps(txns, cur, next), [txns, cur, next])
  const rows = Array.from(new Set([...lines.map(l => l.category), ...Object.keys(sug)])).map(c => {
    const l = lines.find(x => x.category === c)
    const keepSame = !!l?.manual || !sug[c]
    return { c, l, s: sug[c], start: String(keepSame && l ? l.base : sug[c]?.cap ?? l?.base ?? 0) }
  }).sort((a, b) => (b.l?.base ?? 0) - (a.l?.base ?? 0))
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(rows.map(r => [r.c, r.start])))
  const [on, setOn] = useState<Set<string>>(() => new Set(rows.filter(r => r.l).map(r => r.c)))
  const [roll, setRoll] = useState<Set<string>>(() => new Set(rows.filter(r => r.l?.rollover).map(r => r.c)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const extras = budgets.filter(b => b.month_year === month && (b.currency || 'INR') === cur && isReserved(b.category))
  const total = rows.filter(r => on.has(r.c)).reduce((a, r) => a + (Number(vals[r.c]) || 0), 0)

  async function apply() {
    setBusy(true); setError('')
    const saved: any[] = []
    const write = async (row: Row) => { const { data, error } = await writeBudget(supabase, row); if (error) throw new Error(error.message); if (data) saved.push(data) }
    try {
      for (const r of rows.filter(r => on.has(r.c))) {
        const v = Number(vals[r.c]) || 0
        await write({ category: r.c, currency: cur, monthly_cap: v, month_year: next, is_manual: !(r.s && v === r.s.cap), rollover: FIXED.has(r.c) ? false : roll.has(r.c) })
      }
      // Save-first target and per-person budgets carry over as they are
      for (const b of extras) await write({ category: b.category, currency: cur, monthly_cap: Number(b.monthly_cap) || 0, month_year: next, is_manual: true, holder_name: b.holder_name ?? undefined })
    } catch (e: any) { setError(e.message); setBusy(false); return }
    setBusy(false)
    onSaved(saved)
  }

  return (
    <Sheet title={`Plan ${monthName(next)}`} sub={`${cur === 'AED' ? 'UAE (AED)' : 'India (₹)'} · this month's spending next to a suggestion for next month`} onClose={onClose}>
      <div className="px-5 pb-5">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10.5px] font-semibold uppercase tracking-[0.05em] pb-1.5" style={{ color: 'var(--text4)' }}>
          <span>Category</span><span className="text-right w-[124px]">This month</span><span className="text-right w-[110px]">Next month</span>
        </div>
        <ul>
          {rows.map(r => (
            <li key={r.c} className="py-2" style={{ borderTop: '1px solid #F1F5F9', opacity: on.has(r.c) ? 1 : 0.5 }}>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
                <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                  <input type="checkbox" checked={on.has(r.c)} className="accent-[var(--accent)] w-4 h-4 flex-shrink-0"
                    onChange={e => setOn(p => { const n = new Set(p); e.target.checked ? n.add(r.c) : n.delete(r.c); return n })} />
                  <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{budgetLabel(r.c)}</span>
                </label>
                <span className="text-right w-[124px] text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: r.l && r.l.spent > r.l.cap ? '#DC2626' : 'var(--text3)' }}>
                  {r.l ? `${fmtCompact(r.l.spent, cur)} / ${fmtCompact(r.l.base, cur)}` : 'no budget'}
                </span>
                <input value={vals[r.c]} onChange={e => setVals(v => ({ ...v, [r.c]: e.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" aria-label={`${budgetLabel(r.c)} next month`}
                  className="w-[110px] text-right rounded-lg px-2 py-1.5 text-[13px] font-semibold tabular-nums" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', color: 'var(--text)' }} />
              </div>
              <div className="flex items-center gap-3 mt-1 pl-6 text-[11.5px]" style={{ color: 'var(--text4)' }}>
                {r.s && <button onClick={() => setVals(v => ({ ...v, [r.c]: String(r.s!.cap) }))} className="font-semibold" style={{ color: 'var(--accent)' }}>Suggested {fmtMoney(r.s.cap, cur)}</button>}
                {r.l && <button onClick={() => setVals(v => ({ ...v, [r.c]: String(r.l!.base) }))} className="font-semibold" style={{ color: 'var(--text3)' }}>Same as now</button>}
                {!FIXED.has(r.c) && <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={roll.has(r.c)} className="accent-[var(--accent)] w-3.5 h-3.5"
                  onChange={e => setRoll(p => { const n = new Set(p); e.target.checked ? n.add(r.c) : n.delete(r.c); return n })} />Roll over</label>}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-[13px] font-semibold mt-2 pt-2" style={{ borderTop: '1px solid var(--track)', color: 'var(--text)' }}>
          <span>Next month's budget</span><span className="tabular-nums">{fmtMoney(total, cur)}</span>
        </div>
        {extras.length > 0 && <p className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>Your save-first target and per-person budgets carry over too.</p>}
        <div className="mt-3"><Err msg={error} /></div>
        <button onClick={apply} disabled={busy} className="wl-btn wl-btn-primary w-full mt-3 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : `Set ${monthName(next)}'s budget`}</button>
      </div>
    </Sheet>
  )
}
