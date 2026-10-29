'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { shouldAutoLink } from '@/lib/goalMatching'
import { fmtMoney } from '@/lib/format'
import { KINDS, HORIZON, PRIORITY, kindInfo, kindOf, goalPlan, monthsUntil, type Kind, type Cur } from '@/lib/goals'
import { OCCASIONS, occasionOf, nextDueDate } from '@/lib/occasions'
import { fundPlan } from '@/lib/budgets'
import { fmtDay } from '@/lib/insights'
import { Segmented } from '@/components/ui/kit'
import { holderOptions } from '@/hooks/useFamily'

const ALL_INV_TYPES = ['stocks', 'mutual_funds', 'fixed_deposits', 'recurring_deposits', 'nps_accounts', 'lic_policies', 'gold_investments', 'bond_investments', 'etf_investments']
// The older category column (used by investment matching) for each type
const CATEGORY: Partial<Record<Kind, string>> = { emergency: 'emergency', retirement: 'retirement', home: 'real_estate' }
// Columns from migrations 030 and 031 — dropped and retried if not run yet
const NEW_COLS = ['kind', 'priority', 'holder_name', 'inflation_pct', 'return_pct', 'track_cash', 'account_id']
const REC_COLS = ['repeat_months', 'occasion', 'spend_category', 'source_id']
// Types that usually come round again (festivals, premiums, gold)
const REC_KINDS = new Set<Kind>(['celebration', 'payment', 'gold'])
// A name we filled in (a type or occasion name), safe to replace
const isDefaultName = (n: string) => !n.trim() || KINDS.some(x => x.label === n || x.label.split(' / ')[0] === n) || OCCASIONS.some(o => o.name === n)
const QUICK: [string, number][] = [['6 months', 6], ['1 year', 12], ['2 years', 24], ['3 years', 36], ['5 years', 60], ['10 years', 120], ['20 years', 240]]
const dateIn = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10) }

export interface GoalDefaults {
  name?: string; category?: string; kind?: Kind; target?: number; currency?: Cur; months?: number; track_cash?: boolean; holder_name?: string | null
  // Recurring: repeats every N months, from an exact date, for an occasion / policy / budget category
  repeat_months?: number; date?: string; occasion?: string | null; source_id?: string; spend_category?: string; priority?: number
}

// New or edit goal (design v2 sheet): type, amount, date (with its short /
// mid / long-term tag), priority, who it's for, how it's funded — and a live
// preview of what it'll cost by then and what it needs a month. A goal can
// repeat (Diwali, a premium, gold on Dhanteras): it then saves towards its
// next date and starts again after it. `stay` refreshes instead of opening it.
export default function AddGoalModal({ onClose, editData, allInvestments, defaults, accounts = [], members = [], categories = [], stay = false }: {
  onClose: () => void; editData?: any; allInvestments?: Record<string, any[]>; defaults?: GoalDefaults
  accounts?: any[]; members?: { name: string; relationship: string }[]; categories?: string[]; stay?: boolean
}) {
  const isEdit = !!editData
  const supabase = createClient()
  const router = useRouter()
  const startKind: Kind = editData ? kindOf(editData) : defaults?.kind ?? (defaults?.category ? kindOf({ category: defaults.category, name: defaults.name }) : 'other')
  const [kind, setKind] = useState<Kind>(startKind)
  const [name, setName] = useState<string>(editData?.name ?? defaults?.name ?? '')
  const [target, setTarget] = useState<string>(editData?.target_amount != null ? String(editData.target_amount) : defaults?.target ? String(defaults.target) : '')
  const [cur, setCur] = useState<Cur>(editData?.currency ?? defaults?.currency ?? 'INR')
  const [date, setDate] = useState<string>(editData?.target_date ?? defaults?.date ?? (defaults?.months ? dateIn(defaults.months) : ''))
  const [priority, setPriority] = useState<string>(String(editData?.priority ?? defaults?.priority ?? (startKind === 'emergency' ? 1 : 2)))
  const [repeat, setRepeat] = useState<number>(Number(editData?.repeat_months ?? defaults?.repeat_months ?? (REC_KINDS.has(startKind) ? 12 : 0)) || 0)
  const [occasion, setOccasion] = useState<string | null>(editData?.occasion ?? defaults?.occasion ?? null)
  const [spendCat, setSpendCat] = useState<string>(editData?.spend_category ?? defaults?.spend_category ?? '')
  const sourceId: string | null = editData?.source_id ?? defaults?.source_id ?? null
  const [holder, setHolder] = useState<string>(editData?.holder_name ?? defaults?.holder_name ?? '')
  const [trackCash, setTrackCash] = useState<boolean>(editData?.track_cash ?? defaults?.track_cash ?? startKind === 'emergency')
  const [accountId, setAccountId] = useState<string>(editData?.account_id ?? '')
  const [inflation, setInflation] = useState<string>(editData?.inflation_pct != null ? String(editData.inflation_pct) : '')
  const [ret, setRet] = useState<string>(editData?.return_pct != null ? String(editData.return_pct) : '')
  const [notes, setNotes] = useState<string>(editData?.description ?? '')
  const [advanced, setAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const info = kindInfo(kind)
  const today = new Date().toISOString().slice(0, 10)
  const draft = { kind, currency: cur, target_amount: Number(target) || 0, target_date: date || dateIn(12), inflation_pct: inflation === '' ? null : Number(inflation), return_pct: ret === '' ? null : Number(ret) }
  const preview = useMemo(() => date && Number(target) > 0 ? goalPlan(draft, 0, 0, today) : null, [kind, cur, target, date, inflation, ret]) // eslint-disable-line react-hooks/exhaustive-deps
  const banks = accounts.filter(a => a.account_type !== 'credit_card' && a.currency === cur)
  const monthsLeft = date ? monthsUntil(date, today) : 0
  const recurring = repeat > 0
  const recPlan = recurring && date && Number(target) > 0 ? fundPlan({ id: '', name: '', category: null, currency: cur, target: Number(target), due_date: date, saved: 0, last_saved_month: null }, today) : null
  const after = recurring && date ? nextDueDate({ target_date: date, repeat_months: repeat, occasion }) : null
  const occInfo = occasionOf(occasion)
  const occList = OCCASIONS.filter(o => !REC_KINDS.has(kind) || o.kind === kind)
  const smartLinks = !isEdit && !recurring && allInvestments && date ? ALL_INV_TYPES.reduce((n, t) => n + (allInvestments[t] ?? [])
    .filter(r => (r.currency ?? 'INR') === cur && shouldAutoLink(t, r, CATEGORY[kind] ?? 'general', monthsLeft)).length, 0) : 0

  function pickKind(k: Kind) {
    setKind(k)
    if (isDefaultName(name)) setName(kindInfo(k).label.split(' / ')[0])
    if (k === 'emergency') { setTrackCash(true); setPriority('1') } else setTrackCash(false)
    // Festivals, premiums and gold usually repeat; leaving those types makes it one-time again
    if (REC_KINDS.has(k)) setRepeat(r => r || 12)
    else if (REC_KINDS.has(kind)) { setRepeat(0); setOccasion(null) }
  }
  // An occasion fills in its name, date (Diwali's from the calendar), budget and a starting amount
  function pickOccasion(key: string) {
    const o = occasionOf(key)
    if (!o) return
    setOccasion(key); setKind(o.kind); setRepeat(r => r || 12); setSpendCat(o.category); setPriority(String(o.priority))
    if (isDefaultName(name)) setName(o.name)
    if (!Number(target)) setTarget(String(o.amount[cur]))
    const d = o.next(today)
    if (d) setDate(d)
  }

  async function save() {
    if (!name.trim()) { setError('Give your goal a name.'); return }
    if (!(Number(target) > 0)) { setError('Enter how much you need (in today’s money).'); return }
    if (!date) { setError(recurring ? 'Pick the next date it’s due.' : 'Pick when you want it.'); return }
    setSaving(true); setError('')
    const payload: Record<string, any> = {
      name: name.trim(), description: notes.trim() || null, target_amount: Number(target), currency: cur, country: cur === 'AED' ? 'UAE' : 'India',
      target_date: date, category: CATEGORY[kind] ?? 'general', color: info.color, icon: (recurring && occInfo?.icon) || info.icon, updated_at: new Date().toISOString(),
      kind, priority: Number(priority), holder_name: holder || null, track_cash: trackCash,
      account_id: trackCash ? null : accountId || null,
      inflation_pct: inflation === '' || recurring ? null : Number(inflation), return_pct: ret === '' || recurring ? null : Number(ret),
      repeat_months: recurring ? repeat : null, occasion: recurring ? occasion : null,
      spend_category: recurring ? spendCat || null : null, source_id: recurring ? sourceId : null,
    }
    const { data: { user } } = await supabase.auth.getUser()
    const write = (p: Record<string, any>) => isEdit
      ? supabase.from('goals').update(p).eq('id', editData.id).select().single()
      : supabase.from('goals').insert({ ...p, status: 'active', user_id: user!.id }).select().single()
    let res = await write(payload)
    let base = payload
    if (res.error && REC_COLS.some(c => String(res.error!.message).includes(c))) {
      if (recurring) { setError('Run migration 031 in Supabase to make goals repeat.'); setSaving(false); return }
      base = { ...base }; for (const c of REC_COLS) delete base[c]
      res = await write(base)
    }
    if (res.error && NEW_COLS.some(c => String(res.error!.message).includes(c))) {
      base = { ...base }; for (const c of NEW_COLS) delete base[c]
      res = await write(base)
    }
    if (res.error || !res.data) { setError(res.error?.message ?? 'Could not save the goal'); setSaving(false); return }
    // A new goal picks up matching investments in its currency straight away
    if (!isEdit && !recurring && allInvestments) {
      const links: any[] = []
      for (const t of ALL_INV_TYPES) for (const r of allInvestments[t] ?? []) {
        if ((r.currency ?? 'INR') === cur && shouldAutoLink(t, r, CATEGORY[kind] ?? 'general', monthsLeft))
          links.push({ goal_id: res.data.id, user_id: user!.id, investment_type: t, investment_id: r.id, allocation_pct: 100 })
      }
      if (links.length) await supabase.from('goal_investments').insert(links)
    }
    setSaving(false); onClose()
    if (isEdit || stay) router.refresh(); else router.push(`/dashboard/goals/${res.data.id}`)
  }

  const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
  const field = 'wl-input w-full'

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit goal' : 'New goal'} className="wl-sheet-panel w-full max-w-[540px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px]" style={{ background: info.color + '1F' }}>{info.icon}</span>
            <div>
              <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit goal' : 'New goal'}</div>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{info.why}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-4">
          <div>
            <Label>Type of goal</Label>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(k => (
                <button key={k.key} onClick={() => pickKind(k.key)} aria-pressed={kind === k.key}
                  className="rounded-full pl-1.5 pr-3 h-[32px] text-[12.5px] font-medium flex items-center gap-1.5 transition-colors"
                  style={kind === k.key ? { background: k.color + '1F', color: k.color, border: `1.5px solid ${k.color}` } : { background: '#fff', color: 'var(--text2)', border: '1px solid var(--line)' }}>
                  <span className="text-[14px]">{k.icon}</span>{k.label.split(' / ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Aarav's college, Trip home in December" className={field} style={{ height: 42 }} />
          </div>

          <div>
            <Label>Repeats</Label>
            <Segmented label="Repeats" value={String(repeat)} onChange={(v: string) => { setRepeat(Number(v)); if (v === '0') setOccasion(null) }} full
              options={[{ value: '0', label: 'One-time' }, ...[12, 6, 3].map(m => ({ value: String(m), label: m === 12 ? 'Every year' : `${m} months` }))]} />
            {recurring && occList.length > 0 && (
              <div className="flex gap-1.5 mt-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-0.5">
                {occList.map(o => (
                  <button key={o.key} onClick={() => pickOccasion(o.key)} aria-pressed={occasion === o.key} className="wl-chip flex-shrink-0" style={{ height: 30 }}>
                    <span className="text-[13px]">{o.icon}</span>{o.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
            <div className="min-w-0">
              <Label>{recurring ? 'How much each time' : 'How much, in today’s money'}</Label>
              <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 46 }}>
                <span className="text-[14px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
                <input value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" aria-label="Target amount"
                  className="flex-1 min-w-0 w-full bg-transparent outline-none text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
              </div>
            </div>
            <Segmented label="Currency" value={cur} onChange={(c: Cur) => { setCur(c); setAccountId('') }} options={[{ value: 'INR', label: '₹ India' }, { value: 'AED', label: 'AED UAE' }]} />
          </div>

          <div>
            <Label>{recurring ? 'Next date' : 'By when'}</Label>
            {!recurring && <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK.map(([l, m]) => <button key={l} onClick={() => setDate(dateIn(m))} className="wl-chip" style={{ height: 28 }} aria-pressed={!!date && Math.abs(monthsUntil(date, today) - m) <= 0}>{l}</button>)}
            </div>}
            <div className="flex items-center gap-2.5 flex-wrap">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} style={{ height: 42, maxWidth: 200 }} aria-label={recurring ? 'Next date' : 'Target date'} />
              {recurring ? (after && <span className="text-[12px]" style={{ color: 'var(--text3)' }}>then {fmtDay(after)} {after.slice(0, 4)}{repeat === 12 ? '' : ` (every ${repeat} months)`}</span>)
                : preview && <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: HORIZON[preview.horizon].bg, color: HORIZON[preview.horizon].color }}>
                {HORIZON[preview.horizon].label} · {HORIZON[preview.horizon].range}</span>}
            </div>
            {recurring && occInfo && <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>{occInfo.next(today) ? `${occInfo.name.split(' ')[0]} dates are filled in each year.` : `${occInfo.hint[0].toUpperCase()}${occInfo.hint.slice(1)}.`}</div>}
          </div>

          {recurring && (
            <div>
              <Label>Pays for (optional)</Label>
              <select value={spendCat} onChange={e => setSpendCat(e.target.value)} className={field} style={{ height: 42 }} aria-label="Budget category it pays for">
                <option value="">No budget category</option>
                {Array.from(new Set([...(spendCat ? [spendCat] : []), ...categories])).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>In the month it’s due, what you’ve put aside is added to that {cur === 'AED' ? 'UAE' : 'India'} budget.</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={field} style={{ height: 42 }} aria-label="Priority">
                {[1, 2, 3].map(p => <option key={p} value={p}>{PRIORITY[p]}</option>)}
              </select>
            </div>
            <div>
              <Label>For</Label>
              <select value={holder} onChange={e => setHolder(e.target.value)} className={field} style={{ height: 42 }} aria-label="Who it's for">
                <option value="">The whole family</option>
                {holderOptions(members).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {kind === 'emergency' ? (
            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>
              <input type="checkbox" checked={trackCash} onChange={e => setTrackCash(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
              <span><b style={{ color: 'var(--text)' }}>Count my {cur} bank & cash balances</b><br />
                <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Progress follows what's in your {cur === 'AED' ? 'UAE' : 'Indian'} accounts — nothing to update by hand.</span></span>
            </label>
          ) : banks.length > 0 && (
            <div>
              <Label>Savings account kept for it (optional)</Label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className={field} style={{ height: 42 }} aria-label="Linked savings account">
                <option value="">None — I'll link investments or add money</option>
                {banks.map(a => <option key={a.id} value={a.id}>{a.name} · {fmtMoney(Number(a.current_balance) || 0, a.currency)}</option>)}
              </select>
            </div>
          )}

          <button onClick={() => setAdvanced(a => !a)} className="text-[12.5px] font-semibold flex items-center gap-1 self-start" style={{ color: 'var(--accent)' }}>
            <ChevronDown size={14} style={{ transform: advanced ? 'rotate(180deg)' : 'none' }} />{recurring ? 'Add a note' : 'Advanced — price rise, expected return, note'}
          </button>
          {advanced && (
            <div className="grid grid-cols-2 gap-3">
              {!recurring && <><div>
                <Label>Prices rise % a year</Label>
                <input value={inflation} onChange={e => setInflation(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={`${info.inflation[cur]} (usual for ${info.label.split(' / ')[0].toLowerCase()})`} className={field} style={{ height: 42 }} aria-label="Inflation" />
              </div>
              <div>
                <Label>Expected return % a year</Label>
                <input value={ret} onChange={e => setRet(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={preview ? `${preview.ret} (auto, ${HORIZON[preview.horizon].label.toLowerCase()})` : 'auto'} className={field} style={{ height: 42 }} aria-label="Expected return" />
              </div></>}
              <div className="col-span-2">
                <Label>Why it matters (optional)</Label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="A line to keep you going" className={field} style={{ height: 42 }} />
              </div>
            </div>
          )}

          {recPlan ? (
            <div className="rounded-xl px-3.5 py-3 text-[12.5px] leading-snug" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
              Set aside <b>{fmtMoney(recPlan.monthly, cur)}{recPlan.slots > 1 ? ' a month' : ' now'}</b>{recPlan.slots > 1 ? ` (${recPlan.slots} times)` : ''} and it’s all there by {fmtDay(date)}.
              {after && <> Then it starts again for {fmtDay(after)} {after.slice(0, 4)} — about {fmtMoney(Number(target) / Math.max(1, repeat), cur)} a month over a full {repeat === 12 ? 'year' : `${repeat} months`}.</>}
              <div className="mt-1" style={{ color: 'var(--text3)' }}>Keep it in savings — WealthLens reminds you each month and when it’s due.</div>
            </div>
          ) : !recurring && preview && (
            <div className="rounded-xl px-3.5 py-3 text-[12.5px] leading-snug" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
              {preview.inflation > 0 && <>With prices rising ~{preview.inflation}% a year, that's about <b>{fmtMoney(preview.futureTarget, cur)}</b> by then. </>}
              About <b>{fmtMoney(preview.need, cur)} a month</b> gets you there, assuming {preview.ret}% a year
              <span style={{ color: 'var(--text3)' }}> ({fmtMoney(preview.needRange.optimistic, cur)}–{fmtMoney(preview.needRange.cautious, cur)} if returns are 3% better or worse)</span>.
              <div className="mt-1" style={{ color: 'var(--text3)' }}>{HORIZON[preview.horizon].fit}</div>
            </div>
          )}
          {!isEdit && smartLinks > 0 && <div className="text-[12px]" style={{ color: 'var(--text3)' }}>🔗 {smartLinks} of your {cur} investment{smartLinks === 1 ? '' : 's'} fit this goal and will be linked — change that on the goal page.</div>}

          {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}
          <div className="flex gap-2.5">
            <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
            <button onClick={save} disabled={saving} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
              {saving ? <><Loader2 size={15} className="animate-spin" />Saving…</> : isEdit ? 'Save changes' : 'Create goal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
