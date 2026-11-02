'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, X, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { fmtMoney } from '@/lib/format'
import { fmtDay, ymOf } from '@/lib/insights'
import { expectedIncome } from '@/lib/moneyOverview'
import { earnedIncoming, sentHome } from '@/lib/homePlan'
import { DAY_RULE_TEXT, nextExpected, planDate, type DayRule, type IncomePlan, type PlanKind } from '@/lib/incomePlans'
import { isNre, isNro, kindOf } from '@/lib/ledger'
import { toast } from '@/components/ui/toaster'
import { PageHeader, Segmented } from '@/components/ui/kit'

const VARIANCE = [0, 2, 5, 10, 25]
const TITLE: Record<PlanKind, string> = { income: 'Income I expect', remit: 'UAE → India', nre_nro: 'NRE → NRO' }
const blank = (kind: PlanKind, x: Partial<IncomePlan> = {}): any => ({
  kind, name: kind === 'income' ? 'Salary' : kind === 'remit' ? 'Transfer to India' : 'Move to NRO', amount: '', currency: kind === 'nre_nro' ? 'INR' : 'AED',
  account_id: '', counter_account_id: '', day_rule: 'fixed' as DayRule, day_of_month: 25, variance_pct: 5, ...x,
})

export default function IncomePlansClient({ ready, today, plans, accounts, txns }: { ready: boolean; today: string; plans: IncomePlan[]; accounts: any[]; txns: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const { fxRate: FX } = useViewStore()
  const [form, setForm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }))

  // "Add as regular" from an unknown credit
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('amount')) setForm(blank('income', { name: q.get('name') || 'Income', amount: q.get('amount') as any, currency: q.get('currency') || 'AED', account_id: q.get('account') || '' }))
  }, [])

  // What the app found, to confirm in a tap
  const suggestions = useMemo(() => {
    const found = expectedIncome(earnedIncoming(txns, 'consolidated', FX), accounts, today, 62, { late: true })
      .filter(d => !plans.some(p => p.kind === 'income' && p.account_id === d.accountId && Math.abs(Number(p.amount) - Number(d.usual)) <= Number(p.amount) * 0.3))
      .map(d => ({ key: d.id, text: `${d.label} · ${fmtMoney(Number(d.usual), d.currency)} on ${d.accountName}, around the ${d.day}`,
        form: blank('income', { name: d.label, amount: d.usual as any, currency: d.currency, account_id: d.accountId, day_of_month: d.day ?? 25, category: /Salary/i.test(d.id) ? 'Salary' : null }) }))
    const home = sentHome(txns, today).usual
    const nre = accounts.find(a => isNre(a) && kindOf(a) === 'bank')
    if (home > 0 && !plans.some(p => p.kind === 'remit')) found.push({ key: 'remit', text: `You send about ${fmtMoney(Math.round(home), 'AED')} to India a month`, form: blank('remit', { amount: Math.round(home) as any, counter_account_id: nre?.id ?? '' }) })
    return found
  }, [txns, accounts, plans, today, FX])

  const froms = (f: any) => accounts.filter(a => kindOf(a) !== 'card' && a.currency === f.currency && (f.kind !== 'nre_nro' || !isNro(a)))
  const tos = (f: any) => accounts.filter(a => kindOf(a) === 'bank' && (f.kind === 'remit' ? a.currency === 'INR' : a.currency === 'INR' && a.id !== f.account_id))

  async function save() {
    const f = form, amount = Number(f.amount), variance = Number(f.variance_pct)
    if (!String(f.name).trim()) { setError('Give it a name.'); return }
    if (!(amount > 0)) { setError('Enter the amount.'); return }
    if (!(variance >= 0 && variance <= 100)) { setError('Allowed difference is between 0% and 100%.'); return }
    if (f.day_rule === 'fixed' && !(Number(f.day_of_month) >= 1 && Number(f.day_of_month) <= 31)) { setError('Pick a date from 1 to 31.'); return }
    if (!f.account_id) { setError(f.kind === 'income' ? 'Pick the account it lands in.' : 'Pick the account it leaves from.'); return }
    if (f.kind !== 'income' && !f.counter_account_id) { setError('Pick the account it goes to.'); return }
    setBusy(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const row = { kind: f.kind, name: String(f.name).trim(), amount, currency: f.currency, account_id: f.account_id, counter_account_id: f.kind === 'income' ? null : f.counter_account_id,
      day_rule: f.day_rule, day_of_month: f.day_rule === 'fixed' ? Number(f.day_of_month) : null, variance_pct: variance, category: f.kind === 'income' ? f.category ?? (/salary/i.test(f.name) ? 'Salary' : null) : null }
    const r = f.id ? await supabase.from('income_plans').update(row).eq('id', f.id) : await supabase.from('income_plans').insert({ ...row, user_id: user?.id })
    setBusy(false)
    if (r.error) { setError(r.error.message); return }
    toast('Saved. Your balance only moves when you add the money.')
    setForm(null); router.refresh()
  }
  async function remove(p: IncomePlan) {
    const { error } = await supabase.from('income_plans').delete().eq('id', p.id)
    if (error) toast(error.message, 'error'); else router.refresh()
  }

  const frame = (c: React.ReactNode) => <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up max-w-[680px]"><PageHeader title="Expected income" sub="What you expect each month. It plans ahead for you; your balance moves only when you add the money." />{c}</div>
  if (!ready) return frame(<div className="wl-card px-5 py-5 text-[13.5px]" style={{ color: 'var(--text2)' }}>Expected income needs migration 040 (supabase/migrations/040_income_plans.sql). Run it in Supabase, then refresh.</div>)

  const known = form && Number(form.day_of_month) >= 1 && Number(form.day_of_month) <= 31
  const preview = form && (form.day_rule !== 'fixed' || known) ? planDate({ day_rule: form.day_rule, day_of_month: Number(form.day_of_month) }, ymOf(today)) : null
  const section = (kind: PlanKind, sub: string) => {
    const rows = plans.filter(p => p.kind === kind)
    return (
      <section key={kind} className="wl-card px-4 md:px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{TITLE[kind]}</h2><p className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</p></div>
          <button onClick={() => { setError(''); setForm(blank(kind)) }} className="wl-btn flex-shrink-0 wl-hide-viewing" style={{ height: 36 }}><Plus size={14} />Add</button>
        </div>
        {rows.map(p => {
          const n = nextExpected(p, today, txns)
          return (
            <div key={p.id} className="flex items-center gap-2.5 py-2.5 mt-1" style={{ borderTop: '1px solid #F1F5F9' }}>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{p.name} · {fmtMoney(Number(p.amount), p.currency)}</span>
                <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{p.day_rule === 'fixed' ? `On the ${p.day_of_month}` : DAY_RULE_TEXT[p.day_rule]} · next {fmtDay(n.date)} · up to {Number(p.variance_pct)}% different is fine</span>
              </span>
              <button onClick={() => { setError(''); setForm({ ...p, account_id: p.account_id ?? '', counter_account_id: p.counter_account_id ?? '', day_of_month: p.day_of_month ?? 25 }) }} aria-label={`Edit ${p.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--bg2)] wl-hide-viewing" style={{ color: 'var(--text2)' }}><Pencil size={15} /></button>
              <button onClick={() => remove(p)} aria-label={`Remove ${p.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] wl-hide-viewing" style={{ color: '#DC2626' }}><Trash2 size={15} /></button>
            </div>
          )
        })}
      </section>
    )
  }

  return frame(<>
    {suggestions.length > 0 && (
      <section className="rounded-[18px] px-4 md:px-5 py-4 wl-hide-viewing" style={{ background: '#F0EDFF', border: '1px solid #DAD3FF' }}>
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Found in your transactions</h2>
        <p className="text-[12.5px]" style={{ color: 'var(--text2)' }}>Tap one to check it and save.</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {suggestions.map(s => <button key={s.key} onClick={() => { setError(''); setForm(s.form) }} className="wl-btn justify-start text-left" style={{ minHeight: 44, height: 'auto', padding: '8px 12px', whiteSpace: 'normal' }}><Plus size={14} className="flex-shrink-0" />{s.text}</button>)}
        </div>
      </section>
    )}
    {section('income', 'Salary, rent and anything else regular')}
    {section('remit', 'How much you send each month. It counts as money coming in on the India side.')}
    {section('nre_nro', 'Optional: a monthly reminder to move money for spending in India')}

    {form && (
      <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={() => !busy && setForm(null)}>
        <div className="wl-sheet-panel w-full max-w-[480px] rounded-2xl bg-white flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label={TITLE[form.kind as PlanKind]} style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
          <div className="flex items-center justify-between px-5 pt-5 pb-2"><div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{TITLE[form.kind as PlanKind]}</div>
            <button onClick={() => setForm(null)} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><X size={18} /></button></div>
          <div className="px-5 pb-2 overflow-y-auto flex flex-col gap-3">
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Name</span><input value={form.name} onChange={e => set({ name: e.target.value })} className="wl-input w-full" style={{ height: 44 }} /></label>
            <div className="flex gap-2 items-end">
              <label className="block flex-1 min-w-0"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Amount each month</span><input inputMode="decimal" value={form.amount} onChange={e => set({ amount: e.target.value.replace(/[^0-9.]/g, '') })} className="wl-input w-full" style={{ height: 44 }} /></label>
              {form.kind === 'income' && <Segmented label="Currency" value={form.currency} onChange={(c: string) => set({ currency: c, account_id: '' })} options={[{ value: 'AED', label: 'AED' }, { value: 'INR', label: '₹ INR' }]} />}
            </div>
            <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>{form.kind === 'income' ? 'Lands in' : 'From'}</span>
              <select value={form.account_id} onChange={e => set({ account_id: e.target.value })} className="wl-input w-full" style={{ height: 44 }}><option value="">Choose account</option>{froms(form).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            {form.kind !== 'income' && <label className="block"><span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>To</span>
              <select value={form.counter_account_id} onChange={e => set({ counter_account_id: e.target.value })} className="wl-input w-full" style={{ height: 44 }}><option value="">Choose account</option>{tos(form).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
            <div>
              <span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>When</span>
              <div className="flex flex-col gap-1.5">
                {(Object.keys(DAY_RULE_TEXT) as DayRule[]).map(r => (
                  <label key={r} className="flex items-center gap-2.5 min-h-[40px] text-[13.5px] cursor-pointer" style={{ color: 'var(--text)' }}>
                    <input type="radio" name="day_rule" checked={form.day_rule === r} onChange={() => set({ day_rule: r })} className="w-4 h-4 accent-[var(--accent)]" />{DAY_RULE_TEXT[r]}
                    {r === 'fixed' && form.day_rule === 'fixed' && <input inputMode="numeric" value={form.day_of_month} onChange={e => set({ day_of_month: e.target.value.replace(/\D/g, '') })} aria-label="Day of the month" className="wl-input" style={{ height: 36, width: 64 }} />}
                  </label>
                ))}
              </div>
              {preview && <div className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>This month that’s {fmtDay(preview)}. Working days are Monday to Friday.</div>}
            </div>
            <div>
              <span className="block text-[12px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>Allowed difference</span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {VARIANCE.map(v => <button key={v} type="button" onClick={() => set({ variance_pct: v })} aria-pressed={Number(form.variance_pct) === v} className="wl-chip" style={{ height: 36, minWidth: 48, ...(Number(form.variance_pct) === v ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}>{v}%</button>)}
                <label className="inline-flex items-center gap-1 text-[12.5px]" style={{ color: 'var(--text2)' }}>Own:<input inputMode="decimal" value={form.variance_pct} onChange={e => set({ variance_pct: e.target.value.replace(/[^0-9.]/g, '') })} aria-label="Allowed difference in percent" className="wl-input" style={{ height: 36, width: 64 }} />%</label>
              </div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--text3)' }}>If it’s further off than this, you’ll be asked whether it’s the new usual amount.</div>
            </div>
            {error && <div className="text-[12.5px] rounded-[10px] px-3 py-2" style={{ background: '#FDECEC', color: '#B42318' }}>{error}</div>}
          </div>
          <div className="flex gap-2.5 px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button onClick={() => setForm(null)} disabled={busy} className="wl-btn" style={{ height: 44 }}>Cancel</button>
            <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 justify-center" style={{ height: 44 }}>{busy && <Loader2 size={15} className="animate-spin" />}Save</button>
          </div>
        </div>
      </div>
    )}
  </>)
}
