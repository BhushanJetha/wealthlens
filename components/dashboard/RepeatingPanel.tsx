'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pause, Play, Trash2, Repeat, Zap, Hand } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { nextDate, suggestRepeats, type RecurringTxn } from '@/lib/recurring'
import { Panel } from '@/components/ui/kit'
import AddTransactionModal from '@/components/forms/AddTransactionModal'
import { answerCharge, answerNo, answerSame, answerSeparate, type FoundCharge } from '@/lib/regular'
import { ruleTextFor } from '@/lib/rules'

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

// Repeating entries (Money › Bills): what's set to repeat, whether it adds
// itself or asks first, and things you add by hand every month that could.
export default function RepeatingPanel({ list, ready, transactions, accounts, today, found = [], answers = [] }: {
  list: RecurringTxn[]; ready: boolean; transactions: any[]; accounts: any[]; today: string; found?: FoundCharge[]; answers?: string[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState(list)
  useEffect(() => setRows(list), [list])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const accName = (id: string | null) => accounts.find(a => a.id === id)?.name ?? null
  // (what's in the found list below is asked about there)
  const foundNames = useMemo(() => new Set(found.map(f => ruleTextFor(f.name))), [found])
  const suggestions = useMemo(() => today ? suggestRepeats(transactions, rows, today).filter(s => !foundNames.has(s.key)).slice(0, 4) : [], [transactions, rows, today, foundNames])
  async function answer(f: FoundCharge, next: string | null) {
    setBusy(f.key); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await answerCharge(supabase, user.id, f.key, answers, next) : 'Please sign in again.'
    setBusy(null)
    if (err) { setError(err); return }
    router.refresh()
  }
  async function repeatIt(f: FoundCharge) {
    setBusy(f.key); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(null); return }
    const lastMonth = f.seen[0]?.date.slice(0, 7) ?? today.slice(0, 7)
    const { data, error } = await supabase.from('recurring_txns').insert({
      user_id: user.id, merchant: f.name, category: f.category, sub_category: f.sub_category, txn_type: 'expense',
      amount: Math.round(f.med * 100) / 100, currency: f.currency, account_id: f.account_id, counter_account_id: null,
      day_of_month: f.day, every_months: 1, start_month: lastMonth, last_done_month: lastMonth, auto_add: false,
    }).select().single()
    setBusy(null)
    if (error) { setError(error.message); return }
    setRows(rs => [...rs, data as RecurringTxn]); router.refresh()
  }

  async function patch(r: RecurringTxn, change: Partial<RecurringTxn>) {
    setBusy(r.id); setError('')
    const { error } = await supabase.from('recurring_txns').update(change).eq('id', r.id)
    setBusy(null)
    if (error) { setError(error.message); return }
    setRows(rs => rs.map(x => (x.id === r.id ? { ...x, ...change } : x))); router.refresh()
  }
  async function remove(r: RecurringTxn) {
    setBusy(r.id); setError('')
    const { error } = await supabase.from('recurring_txns').delete().eq('id', r.id)
    setBusy(null)
    if (error) { setError(error.message); return }
    setRows(rs => rs.filter(x => x.id !== r.id)); router.refresh()
  }
  async function adopt(s: ReturnType<typeof suggestRepeats>[number]) {
    setBusy(s.key); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(null); return }
    const { data, error } = await supabase.from('recurring_txns').insert({
      user_id: user.id, merchant: s.merchant, category: s.category, sub_category: s.sub_category, txn_type: s.txn_type,
      amount: Math.round(s.amount * 100) / 100, currency: s.currency, account_id: s.account_id, counter_account_id: s.counter_account_id,
      day_of_month: s.day, every_months: 1, start_month: s.lastMonth, last_done_month: s.lastMonth, auto_add: false,
    }).select().single()
    setBusy(null)
    if (error) { setError(error.message); return }
    setRows(rs => [...rs, data as RecurringTxn]); router.refresh()
  }

  if (!ready) return (
    <Panel title="Repeating entries">
      <p className="text-[12.5px] mt-1.5 leading-normal" style={{ color: 'var(--text3)' }}>
        Rent, SIPs and money you send home can add themselves each month. Run migration 027 in Supabase to turn this on.
      </p>
    </Panel>
  )

  return (
    <Panel title="Repeating entries" right={
      <button onClick={() => setAdding(true)} className="wl-btn" style={{ height: 30, fontSize: 12 }}><Plus size={13} />New</button>}>
      {rows.length === 0 && suggestions.length === 0 && (
        <p className="text-[12.5px] mt-1.5 leading-normal" style={{ color: 'var(--text3)' }}>
          Rent, SIPs, family support — anything you record by hand every month. Tick <b>Repeat every month</b> when you add one (or choose it on an expense), and it enters itself on its day, marked pending your approval. Set it to <b>Auto</b> to skip the review.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="mt-1.5">
          {rows.map((r, i) => {
            const next = nextDate(r, today || r.start_month + '-01')
            return (
              <li key={r.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined, opacity: r.is_active ? 1 : 0.55 }}>
                <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: '#F0EDFF', color: '#6A55E8' }}><Repeat size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.merchant}</div>
                  <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>
                    {labelOf(r.category)} · {ordinal(r.day_of_month)} of {r.every_months === 1 ? 'every month' : `every ${r.every_months} months`}
                    {r.is_active ? <> · next {fmtDay(next)}</> : ' · paused'}{accName(r.account_id) ? <span className="max-md:hidden"> · {accName(r.account_id)}</span> : null}
                  </div>
                </div>
                <div className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{fmtMoney(Number(r.amount), r.currency)}</div>
                <button onClick={() => patch(r, { auto_add: !r.auto_add })} disabled={busy === r.id}
                  title={r.auto_add ? 'Enters itself, no review — tap to review each one' : 'Enters itself, waiting for your approval — tap to skip the review'}
                  className="rounded-full px-2 h-[26px] text-[11px] font-semibold flex items-center gap-1 flex-shrink-0"
                  style={r.auto_add ? { background: '#E7F7EF', color: '#1E7A50' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                  {r.auto_add ? <><Zap size={11} />Auto</> : <><Hand size={11} />Review</>}
                </button>
                <button onClick={() => patch(r, { is_active: !r.is_active })} disabled={busy === r.id} aria-label={r.is_active ? `Pause ${r.merchant}` : `Resume ${r.merchant}`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--accent-bg)] flex-shrink-0" style={{ color: 'var(--text3)' }}>
                  {r.is_active ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => remove(r)} disabled={busy === r.id} aria-label={`Delete ${r.merchant}`}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FEF2F2] flex-shrink-0" style={{ color: 'var(--text4)' }}>
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="mt-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
          <div className="text-[11.5px] font-semibold mb-1" style={{ color: 'var(--text2)' }}>You add these by hand every month — let them repeat?</div>
          {suggestions.map(s => (
            <div key={s.key} className="flex items-center gap-3 py-1.5">
              <div className="flex-1 min-w-0 text-[12.5px] truncate" style={{ color: 'var(--text2)' }}>
                <b style={{ color: 'var(--text)' }}>{s.merchant}</b> · {fmtMoney(s.amount, s.currency)} · around the {ordinal(s.day)} · {s.months} of the last 5 months
              </div>
              <button onClick={() => adopt(s)} disabled={busy === s.key} className="wl-btn flex-shrink-0 disabled:opacity-60" style={{ height: 28, fontSize: 12 }}><Repeat size={12} />Repeat</button>
            </div>
          ))}
        </div>
      )}
      {found.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Found in your last 6 months</div>
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>Charges that repeat in your statements. Tell us which are already an entry above, so nothing counts twice.</p>
          <ul className="mt-1">
            {found.map(f => {
              const b = busy === f.key, money = (n: number) => fmtMoney(n, f.currency)
              const st = { height: 28, fontSize: 12 }, btn = 'wl-btn disabled:opacity-60'
              const same = rows.filter(r => r.is_active && r.currency === f.currency && r.txn_type !== 'income')
              const note = f.state === 'looks' ? `Not counted: looks like your ${f.repeat.merchant} (${money(Number(f.repeat.amount))})`
                : f.state === 'same' ? `Not counted: the same as your ${f.repeat.merchant}`
                : f.state === 'no' ? 'Not counted: you said it isn’t regular' : 'Counted in your plan'
              return (
                <li key={f.key} className="py-2.5" style={{ borderTop: '1px solid var(--track)', opacity: f.state === 'no' || f.state === 'same' ? 0.7 : 1 }}>
                  <div className="flex justify-between gap-3 text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                    <span className="min-w-0 truncate">{f.name}</span><span className="tabular-nums flex-shrink-0">{money(f.med)}<span className="font-normal text-[11px]" style={{ color: 'var(--text4)' }}>/mo</span></span>
                  </div>
                  <div className="text-[11.5px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>
                    {labelOf(f.category)} · around the {ordinal(f.day)} · {f.seen.slice(0, 3).map(s => `${fmtDay(s.date)} ${money(s.amount)}`).join(', ')}
                  </div>
                  <div className="text-[11.5px] font-semibold mt-0.5" style={{ color: f.state === 'looks' ? 'var(--amber-text)' : f.state === 'counted' ? 'var(--pos-text)' : 'var(--text3)' }}>{note}</div>
                  <div className="flex gap-1.5 flex-wrap mt-1.5 wl-hide-viewing">
                    {f.state === 'looks' && (<>
                      <button onClick={() => answer(f, answerSame(f.key, f.repeat.id))} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Yes, it’s my {f.repeat.merchant}</button>
                      <button onClick={() => answer(f, answerSeparate(f.key))} disabled={b} className={btn} style={st}>No, it’s separate</button>
                    </>)}
                    {f.state === 'counted' && (<>
                      {same.length > 0 && (
                        <select value="" disabled={b} onChange={e => e.target.value && answer(f, answerSame(f.key, e.target.value))} aria-label={`${f.name} is the same as`} className="wl-input" style={{ height: 28, fontSize: 12, width: 'auto', padding: '0 8px' }}>
                          <option value="">Same as…</option>
                          {same.map(r => <option key={r.id} value={r.id}>{r.merchant}</option>)}
                        </select>
                      )}
                      <button onClick={() => repeatIt(f)} disabled={b} className={btn} style={st}><Repeat size={12} />Make it an entry</button>
                      <button onClick={() => answer(f, answerNo(f.key))} disabled={b} className={btn} style={st}>Not regular</button>
                    </>)}
                    {(f.state === 'same' || f.state === 'no') && <button onClick={() => answer(f, null)} disabled={b} className={btn} style={st}>Undo</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {error && <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>}
      {adding && <AddTransactionModal repeat onClose={() => { setAdding(false); router.refresh() }} />}
    </Panel>
  )
}
