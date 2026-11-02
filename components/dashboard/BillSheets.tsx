'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { kindOf } from '@/lib/ledger'
import { Segmented } from '@/components/ui/kit'
import { toast } from '@/components/ui/toaster'
import { billGoalRow, payBill, setAsideBill, skipBill, takeBack, type Bill } from '@/lib/bigBills'
import { nextDueDate } from '@/lib/occasions'

const label = 'block text-[12px] font-semibold mb-1'
const FIELD = { height: 44 }

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Portalled: these open from inside lists and cards
  return createPortal(
    <div className="fixed inset-0 wl-sheet z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.4)' }} onClick={onClose}>
      <div className="wl-sheet-panel w-full max-w-[480px] rounded-2xl bg-white flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{ boxShadow: '0 20px 60px rgba(15,23,42,.18)' }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }}><X size={18} /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto flex flex-col gap-3">{children}</div>
      </div>
    </div>, document.body)
}
const Field = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <label className="block min-w-0"><span className={label} style={{ color: 'var(--text2)' }}>{name}</span>{children}</label>
)
const digits = (s: string) => s.replace(/[^0-9.]/g, '')

// ── Paid: adds the expense, uses the set-aside money, moves to the next date ──
export function PaySheet({ bill, accounts, categories, txns, today, onClose }: { bill: Bill; accounts: any[]; categories: string[]; txns: any[]; today: string; onClose: () => void }) {
  const router = useRouter()
  const usable = accounts.filter(a => a.currency === bill.currency)
  const lastUsed = txns.filter(t => t.account_id && t.merchant === bill.name && usable.some(a => a.id === t.account_id)).sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)))[0]?.account_id
  const [amount, setAmount] = useState(String(bill.amount))
  const [date, setDate] = useState(bill.due < today ? bill.due : today)
  const [account, setAccount] = useState<string>(lastUsed ?? (usable.length === 1 ? usable[0].id : ''))
  const [category, setCategory] = useState(bill.category ?? '')
  const [busy, setBusy] = useState(false)
  const value = Number(amount), used = Math.min(bill.saved, value || 0)
  const next = bill.goal ? nextDueDate({ ...bill.goal, target_date: bill.due }) : null
  const cats = Array.from(new Set([...(bill.category ? [bill.category] : []), ...categories, 'Other']))

  async function save() {
    if (!(value > 0)) { toast('Enter the amount you paid.', 'error'); return }
    if (date > today) { toast('The date can’t be in the future.', 'error'); return }
    if (!account) { toast('Pick the account it was paid from.', 'error'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await payBill(supabase, user.id, bill, { amount: value, date, accountId: account, category: category || null }) : 'Please sign in again.'
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    toast(`${bill.name} paid · ${fmtMoney(value, bill.currency)}`)
    onClose(); router.refresh()
  }
  return (
    <Sheet title={`${bill.name} paid`} onClose={onClose}>
      <div className="flex gap-2">
        <div className="flex-1"><Field name="Amount paid"><input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(digits(e.target.value))} className="wl-input w-full" style={FIELD} /></Field></div>
        <div className="flex-1"><Field name="Paid on"><input type="date" max={today} value={date} onChange={e => setDate(e.target.value)} className="wl-input w-full" style={FIELD} /></Field></div>
      </div>
      <Field name="Paid from">
        <select value={account} onChange={e => setAccount(e.target.value)} className="wl-input w-full" style={FIELD}>
          <option value="">Choose account</option>
          {usable.map(a => <option key={a.id} value={a.id}>{a.name}{kindOf(a) === 'card' ? ' (card)' : ''}</option>)}
        </select>
      </Field>
      <Field name="Category">
        <select value={category} onChange={e => setCategory(e.target.value)} className="wl-input w-full" style={FIELD}>
          <option value="">Choose category</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>
        {used > 0 ? `${fmtMoney(used, bill.currency)} of it was set aside, so this month's budget isn't hurt. ` : 'Nothing was set aside for it, so it comes from this month. '}
        {value > 0 && value !== bill.amount && !bill.policy ? `Next time we'll plan for ${fmtMoney(value, bill.currency)}. ` : ''}
        {next && `Next one: ${fmtDay(next)}.`}
      </p>
      <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={FIELD}>{busy ? 'Saving…' : 'Mark as paid'}</button>
    </Sheet>
  )
}

// ── Set aside any amount, or take some back ──────────────────────────────────
export function AsideSheet({ bill, today, onClose }: { bill: Bill; today: string; onClose: () => void }) {
  const router = useRouter()
  const [amount, setAmount] = useState(String(bill.monthly || bill.left || ''))
  const [busy, setBusy] = useState(false)
  async function run(back: boolean) {
    const value = Number(amount)
    if (!(value > 0)) { toast('Enter the amount.', 'error'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const err = !user ? 'Please sign in again.' : back ? await takeBack(supabase, user.id, bill, value, today) : await setAsideBill(supabase, user.id, bill, value, today)
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    toast(back ? 'Taken back: it’s free to spend again' : `${fmtMoney(value, bill.currency)} set aside for ${bill.name}`)
    onClose(); router.refresh()
  }
  return (
    <Sheet title={`Set aside for ${bill.name}`} onClose={onClose}>
      <Field name="Amount"><input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(digits(e.target.value))} className="wl-input w-full" style={FIELD} /></Field>
      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>
        {fmtMoney(bill.saved, bill.currency)} of {fmtMoney(bill.amount, bill.currency)} is set aside. The money stays in your bank; it just stops counting as free to spend.
      </p>
      <div className="flex gap-2">
        <button onClick={() => run(false)} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={FIELD}>Set aside</button>
        {bill.saved > 0 && <button onClick={() => run(true)} disabled={busy} className="wl-btn flex-1 disabled:opacity-60" style={FIELD}>Take back</button>}
      </div>
    </Sheet>
  )
}

// ── Add or change a bill ─────────────────────────────────────────────────────
export interface BillDraft { name: string; amount: string; currency: 'AED' | 'INR'; due: string; every: number; category: string; detectKey?: string }
export const TEMPLATES: { name: string; every: number; category: string; currency?: 'AED' | 'INR' }[] = [
  { name: 'Internet', every: 6, category: 'Utilities' },
  { name: 'TV', every: 12, category: 'Utilities' },
  { name: 'School fees', every: 3, category: 'Education' },
  { name: 'Rent cheque', every: 3, category: 'Rent', currency: 'AED' },
  { name: 'Car insurance', every: 12, category: 'Insurance' },
  { name: 'Car registration', every: 12, category: 'Travel & transport', currency: 'AED' },
  { name: 'Visa renewal', every: 24, category: 'Other', currency: 'AED' },
  { name: 'Property tax', every: 12, category: 'Other', currency: 'INR' },
  { name: 'Flights home', every: 12, category: 'Flights' },
]
const EVERY = [3, 6, 12]

export function BillFormSheet({ draft, bill, categories, onClose }: { draft: BillDraft; bill: Bill | null; categories: string[]; onClose: () => void }) {
  const router = useRouter()
  const [f, setF] = useState<BillDraft>(draft)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  const set = (p: Partial<BillDraft>) => setF(x => ({ ...x, ...p }))
  const custom = !EVERY.includes(f.every)
  const fromPolicy = !!bill?.policy
  const cats = Array.from(new Set([...(f.category ? [f.category] : []), ...categories, ...TEMPLATES.map(t => t.category)]))
  const finish = (note: string) => { toast(note); onClose(); router.refresh() }

  async function save() {
    const amount = Number(f.amount)
    if (!f.name.trim()) { toast('Give it a name.', 'error'); return }
    if (!(amount > 0)) { toast('Enter the amount.', 'error'); return }
    if (!f.due) { toast('Pick the next date.', 'error'); return }
    if (!(f.every >= 1 && f.every <= 120)) { toast('How many months between payments?', 'error'); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBusy(false); toast('Please sign in again.', 'error'); return }
    const row = billGoalRow(user.id, { name: f.name, amount, currency: f.currency, due: f.due, every: f.every, category: f.category || null })
    const { error } = bill?.goal
      ? await supabase.from('goals').update({ name: row.name, target_amount: amount, target_date: f.due, repeat_months: f.every, spend_category: row.spend_category, updated_at: new Date().toISOString() }).eq('id', bill.goal.id)
      : await supabase.from('goals').insert(row)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    finish(bill ? 'Saved' : `${row.name} added`)
  }
  // Stops tracking it. A policy stays yours: it's only hidden from this page
  async function remove() {
    if (!sure) { setSure(true); return }
    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let err: string | null = user ? null : 'Please sign in again.'
    if (!err && bill?.goal) err = (await supabase.from('goals').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', bill.goal.id)).error?.message ?? null
    if (!err && bill?.policy) err = await skipBill(supabase, user!.id, `hide:${bill.policy.table === 'lic_policies' ? 'lic' : 'ins'}:${bill.policy.id}`)
    setBusy(false)
    if (err) { toast(err, 'error'); return }
    finish(`${bill?.name} removed from Big bills`)
  }
  return (
    <Sheet title={bill ? `Change ${bill.name}` : 'Add a big bill'} onClose={onClose}>
      {fromPolicy && <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>This comes from your policy. Change the premium or date on the policy itself.</p>}
      {!fromPolicy && <>
        {!bill && !f.detectKey && (
          <div className="flex flex-wrap gap-1.5" aria-label="Common big bills">
            {TEMPLATES.map(t => <button key={t.name} type="button" onClick={() => set({ name: t.name, every: t.every, category: t.category, currency: t.currency ?? f.currency })} aria-pressed={f.name === t.name} className="wl-chip" style={{ height: 34, ...(f.name === t.name ? { background: 'var(--accent-bg)', color: 'var(--accent2)', borderColor: 'var(--accent)' } : {}) }}>{t.name}</button>)}
          </div>
        )}
        <Field name="Name"><input value={f.name} onChange={e => set({ name: e.target.value })} className="wl-input w-full" style={FIELD} /></Field>
        <div className="flex gap-2 items-end">
          <div className="flex-1 min-w-0"><Field name="Amount"><input inputMode="decimal" value={f.amount} onChange={e => set({ amount: digits(e.target.value) })} className="wl-input w-full" style={FIELD} /></Field></div>
          {!bill && <Segmented label="Currency" value={f.currency} onChange={(c: 'AED' | 'INR') => set({ currency: c })} options={[{ value: 'INR', label: '₹ INR' }, { value: 'AED', label: 'AED' }]} />}
        </div>
        <Field name="Next date"><input type="date" value={f.due} onChange={e => set({ due: e.target.value })} className="wl-input w-full" style={FIELD} /></Field>
        <div>
          <span className={label} style={{ color: 'var(--text2)' }}>Comes every</span>
          <div className="flex flex-wrap gap-1.5 items-center">
            {EVERY.map(n => <button key={n} type="button" onClick={() => set({ every: n })} aria-pressed={f.every === n} className="wl-chip" style={{ height: 36, ...(f.every === n ? { background: 'var(--accent-bg)', color: 'var(--accent2)', borderColor: 'var(--accent)' } : {}) }}>{n === 12 ? '12 months' : `${n} months`}</button>)}
            <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--text3)' }}>or
              <input inputMode="numeric" value={custom && f.every ? f.every : ''} onChange={e => set({ every: Number(e.target.value.replace(/\D/g, '')) })} aria-label="Months between payments" placeholder="24" className="wl-input" style={{ height: 36, width: 62 }} /> months
            </span>
          </div>
        </div>
        <Field name="Category">
          <select value={f.category} onChange={e => set({ category: e.target.value })} className="wl-input w-full" style={FIELD}>
            <option value="">Choose category</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={FIELD}>{busy ? 'Saving…' : bill ? 'Save' : 'Add bill'}</button>
      </>}
      {bill && (
        <button onClick={remove} disabled={busy} className="wl-btn disabled:opacity-60" style={{ ...FIELD, color: sure ? '#DC2626' : undefined }}>
          {sure ? (bill.saved > 0 ? `Yes, remove it and free ${fmtMoney(bill.saved, bill.currency)}` : 'Yes, remove it') : 'Remove from Big bills'}
        </button>
      )}
    </Sheet>
  )
}
