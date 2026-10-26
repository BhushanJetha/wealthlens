'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import { CreditCard, Plus, AlertTriangle, Clock, Pencil, Trash2, BookOpen, Loader2 } from 'lucide-react'
import AddAccountModal from '@/components/forms/AddAccountModal'
import { PageHeader, InsightBar, AiActions, LearnStrip, HeroStat, KpiTile, Bars, ProgressRow, EmptyState } from '@/components/ui/kit'
import { CreditCardFace } from '@/components/ui/BankCards'
import AccountDetailsSheet from '@/components/forms/AccountDetailsSheet'
import { addMonths, fmtDay } from '@/lib/insights'
import { fmtCompact } from '@/lib/format'
import { Gauge, CalendarClock, Wallet } from 'lucide-react'

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const utilColor = (u: number) => u > 50 ? '#DC2626' : u > 30 ? '#D97706' : '#16A34A'

export default function CardsClient({ cards, txns = [], details = [] }: { cards: any[]; txns?: any[]; details?: any[] }) {
  const { view, fxRate: FX } = useViewStore()
  const router = useRouter()
  const supabase = createClient()

  const [showAdd, setShowAdd]     = useState(false)
  const [editCard, setEditCard]   = useState<any | null>(null)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [deleting, setDeleting]   = useState(false)
  const [openCard, setOpenCard]   = useState<any | null>(null)
  const detailsOf = (id: string) => details.find((d: any) => d.account_id === id) ?? null

  const filtered = view === 'uae'   ? cards.filter(c => c.currency === 'AED')
    : view === 'india' ? cards.filter(c => c.currency === 'INR') : cards

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt
  const sym  = view === 'uae' ? 'AED ' : '₹'

  const totalBal    = filtered.reduce((a, c) => a + conv(Number(c.outstanding_bal ?? 0), c.currency), 0)
  const totalLimit  = filtered.reduce((a, c) => a + conv(Number(c.credit_limit ?? 0), c.currency), 0)
  const totalMinDue = filtered.reduce((a, c) => a + conv(Number(c.minimum_due ?? 0), c.currency), 0)
  const overallUtil = totalLimit > 0 ? Math.round(totalBal / totalLimit * 100) : 0

  const today = new Date()
  const short = (n: number) => fmtCompact(n, view === 'uae' ? 'AED' : 'INR')
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString('en-IN')}`

  // Next due date per card (a past date rolls forward a month at a time)
  const dueOf = (c: any) => {
    if (!c.due_date) return null
    let d = String(c.due_date).slice(0, 10)
    const t = today.toISOString().slice(0, 10)
    for (let i = 0; d < t && i < 24; i++) d = `${addMonths(d.slice(0, 7), 1)}-${d.slice(8, 10)}`
    return d
  }
  const next = filtered.map(c => ({ c, d: dueOf(c) })).filter(x => x.d).sort((a, b) => a.d!.localeCompare(b.d!))[0]

  // Charges on these cards by month (card bill payments excluded)
  const ids = new Set(filtered.map(c => c.id))
  const thisMonth = today.toISOString().slice(0, 7)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5))
  const spendBy: Record<string, number> = {}
  txns.forEach(t => {
    const m = String(t.txn_date).slice(0, 7)
    if (!ids.has(t.account_id) || t.txn_type !== 'expense' || t.category === 'Credit Card Payment') return
    spendBy[m] = (spendBy[m] ?? 0) + conv(Number(t.amount) || 0, t.currency)
  })
  const spendBars = months.map(m => ({ label: MON[Number(m.slice(5)) - 1], value: spendBy[m] ?? 0, hi: m === thisMonth,
    tip: `${MON[Number(m.slice(5)) - 1]}: ${money(spendBy[m] ?? 0)}` }))

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('accounts').update({ is_active: false }).eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <div className="max-md:order-1"><PageHeader title="Credit cards"
        sub={`${filtered.length} active card${filtered.length !== 1 ? 's' : ''} · ${overallUtil}% of your limit in use`}
        onAdd={() => setShowAdd(true)} addLabel="Add card"
        actions={<button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add card</button>} /></div>
      {filtered.length > 0 && <div className="max-md:order-4"><InsightBar
        text={`You owe ${sym}${Math.round(totalBal).toLocaleString('en-IN')} on ${sym}${Math.round(totalLimit).toLocaleString('en-IN')} of limits — ${overallUtil}% used. ${overallUtil > 30 ? 'Bringing it under 30% helps your credit score.' : 'That is under the 30% that lenders like to see.'} Minimum due across cards: ${sym}${Math.round(totalMinDue).toLocaleString('en-IN')}.`}
        prompt={`Explain my credit cards page. Outstanding ${sym}${Math.round(totalBal)}, limits ${sym}${Math.round(totalLimit)}, utilisation ${overallUtil}%, minimum due ${sym}${Math.round(totalMinDue)}. Cards: ${filtered.map((c: any) => `${c.name} ${c.currency} ${c.outstanding_bal} of ${c.credit_limit}${c.due_date ? ` due ${c.due_date}` : ''}`).join('; ')}.`} /></div>}
      {filtered.length > 0 && <div className="max-md:order-5"><AiActions actions={['Which card should I pay first?', 'How do I lower my utilisation?']}
        context={`Cards: ${filtered.map((c: any) => `${c.name} ${c.currency} ${c.outstanding_bal} of ${c.credit_limit}${c.due_date ? ` due ${c.due_date}` : ''}`).join('; ')}.`} /></div>}

      {filtered.length === 0 ? (
        <div className="max-md:order-2"><EmptyState message="No credit cards yet. Add one, or import a card statement to fill in the balance, minimum due and due date."
          cta="Add card" onCta={() => setShowAdd(true)} onImport={() => router.push('/dashboard/ingest?m=card')} /></div>
      ) : (<>
        <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4">
          <HeroStat className="max-md:order-2" label="Outstanding" value={money(totalBal)} tone={overallUtil > 30 ? 'bad' : 'good'}
            delta={`${overallUtil}% of ${short(totalLimit)} in limits used${overallUtil > 30 ? ' · aim for under 30%' : ''}`}
            right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Spent on cards by month</span>}>
            {spendBars.some(b => b.value > 0)
              ? <Bars data={spendBars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[170px] mt-3" label={`Card spending: ${spendBars.map(b => b.tip).join(', ')}`} />
              : <p className="text-[12px] mt-3" style={{ color: 'var(--text3)' }}>Import a card statement to see monthly card spending here.</p>}
          </HeroStat>

          <section className="wl-card max-md:order-6 px-4 md:px-5 py-4 md:py-[18px] flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Utilisation by card</h2>
            {filtered.map((c: any) => {
              const u = Number(c.credit_limit) > 0 ? Math.round(Number(c.outstanding_bal) / Number(c.credit_limit) * 100) : 0
              const l = c.currency === 'AED' ? 'AED ' : '₹'
              return <ProgressRow key={c.id} name={c.name} sub={`${l}${Number(c.outstanding_bal ?? 0).toLocaleString('en-IN')} of ${l}${Number(c.credit_limit ?? 0).toLocaleString('en-IN')}`}
                value={`${u}%`} pct={u} color={utilColor(u)} />
            })}
            <p className="text-[11.5px] mt-auto" style={{ color: 'var(--text4)' }}>Lenders like to see under 30% used on each card.</p>
          </section>
        </div>

        <div className="max-md:order-3 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="Utilisation" value={`${overallUtil}%`} delta={overallUtil > 30 ? 'Above the 30% guide' : 'Healthy (under 30%)'} tint={0} icon={Gauge}
            tone={overallUtil > 30 ? 'bad' : 'good'} />
          <KpiTile label="Next due" value={next ? fmtDay(next.d!) : '—'} tint={2} icon={CalendarClock}
            delta={next ? `${next.c.name} · ${next.c.currency === 'AED' ? 'AED ' : '₹'}${Number(next.c.outstanding_bal ?? 0).toLocaleString('en-IN')}` : 'No due dates set'} />
          <KpiTile label="Minimum due" value={money(totalMinDue)} delta="Pay in full to avoid interest" tint={3} icon={AlertTriangle} />
          <KpiTile label="Credit limit" value={short(totalLimit)} delta={`${short(Math.max(totalLimit - totalBal, 0))} available`} tint={1} icon={Wallet} />
        </div>

        {/* Your cards, drawn like the real thing — tap one for its details */}
        <section className="max-md:order-7 flex flex-col gap-2.5 md:gap-3">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-[15px] md:text-[16px] font-semibold" style={{ color: 'var(--text)' }}>Your cards</h2>
            <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Tap a card for its details</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {filtered.map((c: any) => {
              const u = Number(c.credit_limit) > 0 ? Math.round(Number(c.outstanding_bal) / Number(c.credit_limit) * 100) : 0
              const l = c.currency === 'AED' ? 'AED ' : '₹'
              const d = dueOf(c)
              const days = d ? Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000) : null
              return (
                <button key={c.id} onClick={() => setOpenCard(c)} className="group text-left wl-card p-3 md:p-3.5 transition-shadow hover:shadow-lg"
                  aria-label={`${c.name}: ${l}${Number(c.outstanding_bal ?? 0).toLocaleString('en-IN')} outstanding. Open details`}>
                  <CreditCardFace card={c} details={detailsOf(c.id)} />
                  <div className="px-1 pt-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Outstanding</span>
                      <span className="text-[16px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{l}{Number(c.outstanding_bal ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1.5" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(u, 2), 100)}%`, background: utilColor(u) }} /></div>
                    <div className="flex justify-between gap-2 text-[11.5px] mt-1.5">
                      <span style={{ color: utilColor(u) }}>{u}% of {l}{Number(c.credit_limit ?? 0).toLocaleString('en-IN')} used</span>
                      <span style={{ color: days != null && days <= 5 ? '#DC2626' : 'var(--text3)' }}>{d ? `Due ${fmtDay(d)}${days != null && days <= 7 ? ` · ${days}d` : ''}` : 'No due date'}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </>)}

      {openCard && (() => {
        const c = openCard, l = c.currency === 'AED' ? 'AED ' : '₹', d = dueOf(c)
        const lim = Number(c.credit_limit) || 0, bal = Number(c.outstanding_bal) || 0
        const fmtN = (n: number) => `${l}${Math.round(n).toLocaleString('en-IN')}`
        return <AccountDetailsSheet account={c} details={detailsOf(c.id)} isCard face={<CreditCardFace card={c} details={detailsOf(c.id)} />}
          facts={[['Outstanding', fmtN(bal)], ['Credit limit', lim ? fmtN(lim) : '—'], ['Available', lim ? fmtN(Math.max(lim - bal, 0)) : '—'],
            ['Minimum due', Number(c.minimum_due) > 0 ? fmtN(Number(c.minimum_due)) : '—'], ['Due date', d ? fmtDay(d) : '—'], ['Used', lim ? `${Math.round(bal / lim * 100)}%` : '—']]}
          onClose={() => setOpenCard(null)} onEdit={() => { setOpenCard(null); setEditCard(c) }} onDelete={() => { setOpenCard(null); setDeleteId(c.id) }} />
      })()}

      {/* Add modal */}
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} type="credit_card" />}

      {/* Edit modal */}
      {editCard && (
        <AddAccountModal
          onClose={() => setEditCard(null)}
          type="credit_card"
          initialData={editCard}
          cardId={editCard.id}
        />
      )}

      {/* Delete confirm dialog */}
      {deleteId && (
        <div className="fixed inset-0 wl-sheet bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="wl-sheet-panel rounded-2xl p-6 w-full max-w-sm"
            style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--rose-bg)' }}>
                <Trash2 size={18} style={{ color: 'var(--rose)' }} />
              </div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete Credit Card?</h2>
            </div>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text2)' }}>
              This card will be removed from your dashboard. All associated transaction history remains intact.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold"
                style={{ border: '1px solid var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--rose)' }}>
                {deleting ? <><Loader2 size={13} className="animate-spin" />Deleting…</> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-md:order-8"><LearnStrip title="Statement date vs due date" href="/dashboard/cards/learn" /></div>
    </div>
  )
}
