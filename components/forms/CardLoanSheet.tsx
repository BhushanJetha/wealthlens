'use client'
import { useMemo, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { addMonths, localToday, fmtDay } from '@/lib/insights'
import { cycleOf } from '@/lib/cardCycle'
import { solveLoan, balanceAfter } from '@/lib/loanMath'
import { takeNewLoanOutOfCard } from '@/lib/cardLoans'
import { Segmented } from '@/components/ui/kit'

const num = (s: string) => (s.trim() === '' ? null : Number(s))
const plusMonths = (d: string, n: number) => { const ym = addMonths(d.slice(0, 7), n); const [y, m] = ym.split('-').map(Number); const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${ym}-${String(Math.min(Number(d.slice(8, 10)), dim)).padStart(2, '0')}` }

// A loan taken on a credit card — cash to your bank (loan on card, LOC) or a
// card purchase turned into EMIs. Give any three of amount, rate, months and
// EMI; the fourth is worked out (flat rates shown as what they really cost).
// It's saved once, in Loans, linked to the card: its EMIs are billed to the
// card each month and the loan goes down; what's still owed blocks that much
// of the card's limit. Nothing is counted twice: the money was counted when
// it was spent, so the EMIs aren't spending again.
export default function CardLoanSheet({ cards, card: start, banks, onClose, onSaved }: {
  cards: any[]; card?: any | null; banks: any[]; onClose: () => void; onSaved: () => void
}) {
  const today = localToday()
  const [cardId, setCardId] = useState<string>(start?.id ?? cards[0]?.id ?? '')
  const card = cards.find(c => c.id === cardId) ?? null
  const cur = card?.currency === 'AED' ? 'AED' : 'INR'
  const [kind, setKind] = useState<'cash' | 'purchase'>('cash')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [flat, setFlat] = useState(cur === 'AED')          // UAE banks usually quote card loans at a flat rate
  const [rate, setRate] = useState('')
  const [months, setMonths] = useState('')
  const [emi, setEmi] = useState('')
  const [taken, setTaken] = useState(today)
  const firstDefault = card ? (cycleOf(card, today)?.closes ?? plusMonths(today, 1)) : plusMonths(today, 1)
  const [firstEmi, setFirstEmi] = useState(firstDefault)
  const [paid, setPaid] = useState('0')
  const myBanks = banks.filter(b => b.currency === card?.currency)
  const [bankId, setBankId] = useState<string>(myBanks[0]?.id ?? '')
  const [record, setRecord] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const P = Number(amount) || 0
  // The one left empty is the one to work out
  const solved = useMemo(() => {
    const filled = [num(rate), num(months), num(emi)].filter(v => v != null).length
    if (!(P > 0) || filled < 2) return null
    return solveLoan({ principal: P, ratePct: num(rate), flat, months: num(months) && Math.round(num(months)!), emi: num(emi) })
  }, [P, rate, months, emi, flat])
  const missing = num(rate) == null ? 'rate' : num(months) == null ? 'months' : num(emi) == null ? 'emi' : null
  const k = Math.max(0, Math.round(Number(paid) || 0))
  const owed = solved ? balanceAfter(P, solved.reducingPct, solved.emi, k) : 0
  const nextEmi = plusMonths(firstEmi, k)
  const money = (n: number) => fmtMoney(n, cur)

  async function save() {
    if (!card) { setError('Pick the card.'); return }
    if (!(P > 0)) { setError('Enter the loan amount.'); return }
    if (!solved) { setError('Fill in two of rate, months and EMI — the third is worked out.'); return }
    if (k >= solved.months) { setError('All its EMIs are already paid — nothing left to track.'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const loan: Record<string, any> = {
      user_id: user!.id, name: name.trim() || `${card.name} — ${kind === 'cash' ? 'loan on card' : 'EMI plan'}`, bank_name: card.bank_name || card.name,
      sanctioned_amt: P, disbursed_amt: P, outstanding_amt: Math.round(owed * 100) / 100, emi_amount: solved.emi, interest_rate: solved.reducingPct,
      loan_start_date: taken, tenure_months: solved.months, months_paid: k, currency: cur, country: cur === 'AED' ? 'UAE' : 'India',
      next_emi_date: nextEmi, loan_type: 'loan_on_card', is_active: true,
      // Billed to the card every month, so it's recorded on the day by itself
      pay_from_account_id: card.id, emi_auto: true, outstanding_as_of: today,
      flat_rate: flat ? solved.ratePct : null, card_loan_kind: kind,
    }
    let res = await supabase.from('home_loans').insert(loan).select('id').single()
    for (const col of ['flat_rate', 'card_loan_kind', 'outstanding_as_of', 'emi_auto', 'pay_from_account_id', 'disbursed_amt']) {
      if (res.error && new RegExp(col).test(res.error.message)) { delete loan[col]; res = await supabase.from('home_loans').insert(loan).select('id').single() }
    }
    if (res.error) { setBusy(false); setError(res.error.message); return }
    // On a card whose balance includes its loans, a loan taken by that
    // balance's date is inside it too — take it out (counted in Loans)
    await takeNewLoanOutOfCard(supabase, card, Math.round(owed * 100) / 100, taken)
    // A new loan moves money once: cash lands in your bank (not income), or the
    // purchase leaves the card balance for the loan (it was already counted as spending)
    if (record && k === 0) {
      const row = kind === 'cash'
        ? (bankId ? { account_id: bankId, txn_type: 'income', category: 'Loan Taken', merchant: `${loan.name} — money received` } : null)
        : { account_id: card.id, txn_type: 'transfer', category: 'Converted to EMI', merchant: `${loan.name} — moved into instalments` }
      if (row) {
        const { error } = await supabase.from('transactions').insert({ user_id: user!.id, txn_date: taken, amount: P, currency: cur, country: loan.country, source: 'manual', is_verified: true, ...row })
        if (error) { setBusy(false); setError(`The loan is saved, but the ${kind === 'cash' ? 'bank credit' : 'card adjustment'} wasn’t: ${error.message}`); return }
      }
    }
    setBusy(false); onSaved()
  }

  const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{children}</div>
  const box = (v: string, set: (s: string) => void, aria: string, ph: string, unit?: string, computed?: string | null) => (
    <div className="flex items-center rounded-xl px-3" style={{ background: computed ? 'var(--accent-bg)' : '#F7F8FA', border: `1px solid ${computed ? 'var(--accent-border)' : '#E2E8F0'}`, height: 44 }}>
      <input value={v} onChange={e => set(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder={computed ?? ph} aria-label={aria}
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold tabular-nums" style={{ color: 'var(--text)' }} />
      {unit && <span className="text-[12px] ml-1 flex-shrink-0" style={{ color: 'var(--text3)' }}>{unit}</span>}
    </div>
  )

  return (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Loan on a card" className="wl-sheet-panel w-full max-w-[540px] rounded-2xl overflow-y-auto"
        style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 24px 60px rgba(15,23,42,.25)', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div>
            <div className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>Loan on a card</div>
            <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Fill in any three — the fourth is worked out. It shows up in Loans too, counted once.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 rounded-xl hover:bg-gray-100" style={{ color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div className="px-5 pb-5 flex flex-col gap-3.5">
          {!start && cards.length > 1 && (
            <div>
              <Label>Card</Label>
              <select value={cardId} onChange={e => { setCardId(e.target.value); setBankId('') }} className="wl-input w-full" style={{ height: 42 }} aria-label="Card">
                {cards.map(c => <option key={c.id} value={c.id}>{c.name} · {c.currency}</option>)}
              </select>
            </div>
          )}
          <Segmented label="What kind" value={kind} onChange={setKind} full options={[{ value: 'cash', label: 'Cash to my bank' }, { value: 'purchase', label: 'A purchase into EMIs' }]} />
          <div>
            <Label>Name (optional)</Label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={card ? `${card.name} — ${kind === 'cash' ? 'loan on card' : 'EMI plan'}` : 'e.g. iPhone EMI'} className="wl-input w-full" style={{ height: 42 }} />
          </div>
          <div>
            <Label>Amount</Label>
            {box(amount, setAmount, 'Loan amount', '0', cur)}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label>Interest is quoted as</Label>
            <Segmented label="Rate type" value={flat ? 'flat' : 'reducing'} onChange={(v: string) => setFlat(v === 'flat')} options={[{ value: 'reducing', label: 'Reducing' }, { value: 'flat', label: 'Flat' }]} />
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div><Label>Rate % a year</Label>{box(rate, setRate, 'Interest rate', 'e.g. 6', '%', missing === 'rate' && solved ? String(solved.ratePct) : null)}</div>
            <div><Label>Months</Label>{box(months, setMonths, 'Months', 'e.g. 12', undefined, missing === 'months' && solved ? String(solved.months) : null)}</div>
            <div><Label>EMI</Label>{box(emi, setEmi, 'EMI', '0', undefined, missing === 'emi' && solved ? String(Math.round(solved.emi)) : null)}</div>
          </div>
          {solved ? (
            <div className="rounded-xl px-3.5 py-3 text-[12.5px] leading-snug" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
              <b>{money(solved.emi)} a month for {solved.months} months</b> · {money(solved.totalInterest)} interest in all.
              {flat && <> A {solved.ratePct}% flat rate really costs about <b>{solved.reducingPct}% a year</b> on a reducing balance.</>}
              {k > 0 && <> After {k} EMI{k === 1 ? '' : 's'}, about <b>{money(owed)}</b> is still owed.</>}
            </div>
          ) : <p className="text-[12px]" style={{ color: 'var(--text4)' }}>Fill in the amount and two of rate, months and EMI.</p>}
          <div className="grid grid-cols-3 gap-2.5">
            <div><Label>Taken on</Label><input type="date" value={taken} onChange={e => setTaken(e.target.value)} className="wl-input w-full" style={{ height: 42 }} aria-label="Taken on" /></div>
            <div><Label>First EMI</Label><input type="date" value={firstEmi} onChange={e => setFirstEmi(e.target.value)} className="wl-input w-full" style={{ height: 42 }} aria-label="First EMI date" /></div>
            <div><Label>EMIs paid</Label><input value={paid} onChange={e => setPaid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="wl-input w-full" style={{ height: 42 }} aria-label="EMIs already paid" /></div>
          </div>
          <p className="text-[11.5px] -mt-1.5" style={{ color: 'var(--text4)' }}>EMIs are billed to the card on its statement — next one {fmtDay(nextEmi)} {nextEmi.slice(0, 4)}. Each month the card owes the EMI and the loan goes down by it.</p>
          {k === 0 && (
            <div className="flex items-start gap-2.5 text-[12.5px] rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>
              <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5 cursor-pointer" aria-label={kind === 'cash' ? 'Add the money to a bank account' : 'Take it off the card balance'} />
              {kind === 'cash' ? (
                <span>Add the {P > 0 ? money(P) : 'money'} to
                  <select value={bankId} onChange={e => setBankId(e.target.value)} className="wl-input mx-1.5 my-0.5 inline-block align-middle" style={{ height: 36, width: 'auto', paddingTop: 0, paddingBottom: 0 }} aria-label="Bank it was paid into">
                    {myBanks.length === 0 && <option value="">no {cur} bank account</option>}
                    {myBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <span className="block text-[11.5px] mt-0.5" style={{ color: 'var(--text4)' }}>Raises its balance — it isn’t income. Skip if a bank statement will bring it in.</span></span>
              ) : (
                <span>Take {P > 0 ? money(P) : 'it'} off the card balance
                  <span className="block text-[11.5px] mt-0.5" style={{ color: 'var(--text4)' }}>The bank moves the purchase into instalments. It stays counted as spending once, when you bought it.</span></span>
              )}
            </div>
          )}
          {error && <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }} role="alert">{error}</div>}
          <div className="flex gap-2.5">
            <button onClick={onClose} className="wl-btn" style={{ height: 44, padding: '0 18px' }}>Cancel</button>
            <button onClick={save} disabled={busy} className="wl-btn wl-btn-primary flex-1 disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>
              {busy ? <><Loader2 size={15} className="animate-spin" />Saving…</> : 'Save loan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
