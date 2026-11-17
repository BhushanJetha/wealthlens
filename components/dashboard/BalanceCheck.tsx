'use client'
// Check your balances: for each account, what WealthLens works out (the
// balance you last set, plus every entry since) next to what your bank shows
// today. Saving a figure makes it the account's balance as of today; entries
// after today move it from there (lib/ledger). The difference is what the app
// didn't know about — a payment not imported, or an entry with no account.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fmtDay } from '@/lib/insights'
import { toast } from '@/components/ui/toaster'

export default function BalanceCheck({ accounts }: { accounts: any[] }) {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const banks = accounts.filter(a => a.account_type !== 'credit_card')
  if (!banks.length) return null
  const today = new Date().toLocaleDateString('en-CA')
  const f = (n: number, c: string) => `${n < 0 ? '−' : ''}${c === 'AED' ? 'AED ' : '₹'}${Math.round(Math.abs(n)).toLocaleString(c === 'AED' ? 'en-US' : 'en-IN')}`
  const entered = banks.filter(a => vals[a.id] != null && vals[a.id] !== '' && Number.isFinite(Number(vals[a.id])))

  async function save() {
    setBusy(true)
    const sb = createClient()
    let failed = 0
    for (const a of entered) {
      const { error } = await sb.from('accounts').update({ current_balance: Number(vals[a.id]), balance_as_of: today }).eq('id', a.id)
      if (error) failed++
    }
    setBusy(false)
    if (failed) toast(`Couldn’t save ${failed} balance${failed === 1 ? '' : 's'}. Try again.`, 'error')
    else { toast(`${entered.length} balance${entered.length === 1 ? '' : 's'} updated to today`); setVals({}) }
    router.refresh()
  }

  return (
    <section className="wl-card px-4 md:px-5 py-4 flex flex-col gap-3" aria-label="Check your balances">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Check your balances</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Type what your bank app shows today. It becomes the balance from today, and what you add after moves it from there.</p>
        </div>
        <button onClick={save} disabled={!entered.length || busy} className="wl-btn wl-btn-primary disabled:opacity-50" style={{ height: 38 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{entered.length ? `Save ${entered.length}` : 'Save'}
        </button>
      </div>
      <div className="flex flex-col">
        {banks.map(a => {
          const app = Number(a.current_balance) || 0, v = vals[a.id], typed = v != null && v !== '' && Number.isFinite(Number(v))
          const diff = typed ? Number(v) - app : 0, l = a._ledger
          return (
            <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_150px] md:grid-cols-[minmax(0,1fr)_170px_150px_minmax(0,170px)] gap-x-3 gap-y-1 items-center py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
              <span className="min-w-0"><b className="block text-[13px] truncate" style={{ color: 'var(--text)' }}>{a.name}</b>
                <span className="block text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{l?.asOf ? `Set on ${fmtDay(l.asOf)}${l.count ? ` + ${l.count} entr${l.count === 1 ? 'y' : 'ies'} since` : ''}` : 'Balance not set yet'}</span></span>
              <span className="text-right md:text-left text-[12.5px] tabular-nums" style={{ color: 'var(--text2)' }}><span className="md:hidden text-[11px]" style={{ color: 'var(--text3)' }}>App: </span>{f(app, a.currency)}</span>
              <label className="col-span-2 md:col-span-1"><span className="sr-only">What {a.name} shows today</span>
                <input inputMode="decimal" placeholder="Bank shows…" value={v ?? ''} onChange={e => setVals(x => ({ ...x, [a.id]: e.target.value.replace(/[^0-9.\-]/g, '') }))}
                  className="wl-input w-full tabular-nums" style={{ height: 38 }} /></label>
              <span className="col-span-2 md:col-span-1 text-[12px]" style={{ color: !typed ? 'var(--text4)' : Math.abs(diff) < 1 ? '#15803D' : '#B45309' }}>
                {!typed ? '' : Math.abs(diff) < 1 ? '✓ Matches' : `Bank has ${f(Math.abs(diff), a.currency)} ${diff > 0 ? 'more' : 'less'} than the app`}
              </span>
            </div>
          )
        })}
      </div>
      <p className="text-[11.5px]" style={{ color: 'var(--text3)' }}>
        A difference usually means a payment that isn’t in your entries (an SIP or bill with no “Paid from”, a statement not imported) — <a href="/dashboard/money/review" className="font-semibold" style={{ color: 'var(--accent)' }}>Review</a> lists entries with no account.
        Setting the balance doesn’t change any entry; entries dated before today no longer move it.
      </p>
    </section>
  )
}
