'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase, Globe, Landmark, Wallet, ArrowRight, ArrowDown, Plus, ArrowRightLeft, CheckCircle2, Info, AlertTriangle, ChevronDown, ChevronUp,
  type LucideIcon,
} from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { pairRemittances, isIncome, isRemitOut, isNreToNro, spendGroup, catOf, labelOf, CC_BILL, MOVEMENT_CATS, type Remittance } from '@/lib/money'
import { fmtDay } from '@/lib/insights'
import { PageHeader, InsightBar, KpiTile, EmptyState } from '@/components/ui/kit'
import { ListCard, ListRow } from '@/components/ui/list'
import AddTransactionModal from '@/components/forms/AddTransactionModal'

const sign = (n: number) => (n < 0 ? '−' : '')
const aedFmt = (n: number) => `${sign(n)}AED ${Math.round(Math.abs(n)).toLocaleString('en-US')}`
const inrFmt = (n: number) => `${sign(n)}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
const inrShort = (n: number) => Math.abs(n) >= 1e5 ? `${sign(n)}₹${(Math.abs(n) / 1e5).toFixed(2)}L` : inrFmt(n)
const STATUS: Record<Remittance['source'], { label: string; color: string; note: string }> = {
  matched:   { label: 'Matched',   color: '#16A34A', note: 'paired with the NRE credit' },
  'via NRO': { label: 'Via NRO',   color: '#3B8EF0', note: '₹ taken from the NRE → NRO move that followed' },
  estimated: { label: 'Estimated', color: '#D97706', note: 'no ₹ credit found — estimated at today’s rate' },
  received:  { label: 'Received',  color: '#6A55E8', note: 'landed in India with no matching UAE debit' },
}

type Row = { label: string; value: string; amount: number; color: string }
function Stage({ icon: Icon, where, title, big, sub, rows, total }: {
  icon: LucideIcon; where: 'UAE' | 'India'; title: string; big: string; sub?: string; rows: Row[]; total: number
}) {
  return (
    <section className="wl-card flex-1 min-w-0 px-4 py-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Icon size={15} /></span>
          <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{title}</span>
        </span>
        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold flex-shrink-0" style={where === 'UAE' ? { background: '#FFF2E2', color: '#B96A0B' } : { background: '#E7F1FE', color: '#1D5FA8' }}>{where}</span>
      </div>
      <div>
        <div className="text-[22px] font-bold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>{big}</div>
        {sub && <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{sub}</div>}
      </div>
      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden gap-[2px]" style={{ background: 'var(--track)' }}>
          {rows.filter(r => r.amount > 0).map(r => <div key={r.label} style={{ width: `${r.amount / total * 100}%`, background: r.color }} title={`${r.label}: ${r.value}`} />)}
        </div>
      )}
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center gap-2 py-1.5 text-[12.5px]" style={{ borderTop: i ? '1px solid var(--track)' : 'none' }}>
            <i className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: r.color }} />
            <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text2)' }}>{r.label}</span>
            <span className="font-semibold tabular-nums" style={{ color: r.amount < 0 ? '#DC2626' : 'var(--text)' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
const Flow = () => (
  <div className="flex items-center justify-center flex-shrink-0 text-[var(--accent)]" aria-hidden>
    <span className="w-8 h-8 rounded-full flex items-center justify-center bg-white" style={{ border: '1px solid var(--accent-border)' }}>
      <ArrowRight size={15} className="hidden lg:block" /><ArrowDown size={15} className="lg:hidden" />
    </span>
  </div>
)

// Money flow (replaces Transfers): how UAE earnings reach India and where they
// end up, counted once. UAE → India and NRE → NRO are moves, never income or
// spending; India income is what lands in NRE (lib/money).
export default function MoneyFlowClient({ transactions, accounts }: { transactions: any[]; accounts: any[] }) {
  const { fromMonth, toMonth, fxRate: FX } = useViewStore()
  const [adding, setAdding] = useState(false)
  const [showMoves, setShowMoves] = useState(false)
  const inR = (d?: string) => { const m = d?.slice(0, 7) ?? ''; return m >= fromMonth && m <= toMonth }
  const acc = (id?: string) => accounts.find(a => a.id === id)
  const isNreAcc = (id?: string) => /\bnre\b/i.test(`${acc(id)?.name ?? ''}`)
  const rangeLabel = fromMonth === toMonth
    ? new Date(`${fromMonth}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${new Date(`${fromMonth}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(`${toMonth}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  const remits = useMemo(() => pairRemittances(transactions, FX).filter(r => inR(r.sentOn ?? r.landedOn)), [transactions, FX, fromMonth, toMonth])

  const f = useMemo(() => {
    const P = transactions.filter(t => inR(t.txn_date))
    const sum = (pred: (t: any) => boolean) => P.filter(pred).reduce((a, t) => a + (Number(t.amount) || 0), 0)
    const aed = (t: any) => t.currency === 'AED', inr = (t: any) => t.currency === 'INR'
    const g = (k: string) => (t: any) => { const x = spendGroup(t); return k === 'spent' ? x === 'living' || x === 'sent' : x === k }
    const uae = {
      earned: sum(t => aed(t) && isIncome(t, 'uae')), spent: sum(t => aed(t) && g('spent')(t)), emi: sum(t => aed(t) && g('loans')(t)),
      invest: sum(t => aed(t) && g('invest')(t)), sent: sum(t => isRemitOut(t)),
    }
    const landed = remits.reduce((a, r) => a + r.inr, 0)
    const sentAed = remits.reduce((a, r) => a + (r.aed ?? 0), 0)
    const paired = remits.filter(r => r.aed && r.source !== 'estimated')
    const rate = paired.length ? paired.reduce((a, r) => a + r.inr, 0) / paired.reduce((a, r) => a + (r.aed ?? 0), 0) : null
    const moved = sum(t => isNreToNro(t))
    const back = sum(t => t.currency === 'INR' && catOf(t) === 'NRO to NRE')     // moved back from NRO to NRE
    const earnedIndia = sum(t => inr(t) && isIncome(t, 'consolidated'))
    const side = (nre: boolean) => (t: any) => inr(t) && isNreAcc(t.account_id) === nre
    const outOf = (nre: boolean) => ({
      spent: sum(t => side(nre)(t) && g('spent')(t)), emi: sum(t => side(nre)(t) && g('loans')(t)), invest: sum(t => side(nre)(t) && g('invest')(t)),
      earned: sum(t => side(nre)(t) && isIncome(t, 'consolidated')),
    })
    const nre = outOf(true), nro = outOf(false)
    const moves = P.filter(t => (MOVEMENT_CATS.has(catOf(t)) || catOf(t) === CC_BILL) && !isRemitOut(t))
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
    return { uae, landed, sentAed, rate, moved, back, earnedIndia, nre, nro, moves }
  }, [transactions, remits, fromMonth, toMonth, accounts])

  const { uae, nre, nro } = f
  const uaeLeft = uae.earned - uae.spent - uae.emi - uae.invest - uae.sent
  const nreIn = f.landed + nre.earned + f.back, nreUsed = nre.spent + nre.emi + nre.invest
  const nreLeft = nreIn - f.moved - nreUsed
  const nroIn = f.moved + nro.earned, nroLeft = nroIn - nro.spent - nro.emi - nro.invest - f.back
  const indiaIn = f.landed + f.earnedIndia
  const indiaSpent = nre.spent + nro.spent, indiaEmi = nre.emi + nro.emi, indiaInvest = nre.invest + nro.invest
  const indiaSaved = indiaIn - indiaSpent - indiaEmi
  const best = remits.filter(r => r.rate && r.source !== 'estimated').sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
  const empty = uae.earned === 0 && remits.length === 0 && indiaIn === 0

  const summary = remits.length
    ? `In ${rangeLabel} you sent ${aedFmt(f.sentAed)} to India and ${inrFmt(f.landed)} landed${f.rate ? ` at about ₹${f.rate.toFixed(2)} per AED` : ''}. ${f.moved > 0 ? `${inrShort(f.moved)} moved from NRE to NRO for daily spending. ` : ''}In India you spent ${inrShort(indiaSpent)}, paid ${inrShort(indiaEmi)} in EMIs and invested ${inrShort(indiaInvest)}.`
    : `No transfers from UAE to India in ${rangeLabel}. Record one, or import your ENBD and NRE statements, to see the full flow.`

  const notes: { tone: 'good' | 'info' | 'warn'; text: string }[] = []
  if (best.length >= 2) {
    const hi = best[0], lo = best[best.length - 1]
    const extra = remits.filter(r => r.aed && r.source !== 'estimated').reduce((a, r) => a + (r.aed ?? 0) * ((hi.rate ?? 0) - (r.rate ?? 0)), 0)
    notes.push({ tone: 'info', text: `Best rate ₹${hi.rate!.toFixed(2)} (${fmtDay(hi.landedOn)}), lowest ₹${lo.rate!.toFixed(2)} (${fmtDay(lo.landedOn)}). At the best rate every time you'd have received about ${inrFmt(extra)} more — the FX optimizer can help time transfers.` })
  }
  if (remits.some(r => r.source === 'estimated')) notes.push({ tone: 'warn', text: `${remits.filter(r => r.source === 'estimated').length} transfer(s) have no ₹ credit yet, so the amount landed is estimated at today’s rate. Import your NRE statement to use the real figure.` })
  if (nreLeft > 0 && f.landed > 0) notes.push({ tone: 'info', text: `${inrShort(nreLeft)} stayed in NRE this period. Money sitting in NRE can earn more in an NRE FD (interest is tax-free in India).` })
  if (uae.earned > 0 && uaeLeft < 0) notes.push({ tone: 'warn', text: `More went out of your UAE accounts than came in (${aedFmt(-uaeLeft)}), including what you sent to India.` })
  if (indiaIn > 0 && indiaSaved >= 0) notes.push({ tone: 'good', text: `Of the ${inrShort(indiaIn)} that reached or was earned in India, ${inrShort(indiaSaved)} was saved after spending and EMIs (${Math.round(indiaSaved / indiaIn * 100)}%), including ${inrShort(indiaInvest)} invested.` })

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Money flow" sub={`UAE → India · how your money moves and where it ends up · ${rangeLabel}`}
        onAdd={() => setAdding(true)} addLabel="Add transfer"
        actions={<>
          <Link href="/dashboard/fx" className="wl-btn" style={{ height: 34 }}><Globe size={14} />FX optimizer</Link>
          <button onClick={() => setAdding(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add transfer</button>
        </>} />

      <InsightBar text={summary} prompt={`Explain my UAE to India money flow. ${summary}`} />

      {empty ? (
        <EmptyState message="Add your UAE salary and a transfer to India (or import your ENBD, NRE and NRO statements) to see how your money flows from UAE to India." cta="Add transfer" onCta={() => setAdding(true)} />
      ) : (<>
        {/* The pipeline: each stage shows where its money went */}
        <div className="flex flex-col lg:flex-row items-stretch gap-2">
          <Stage icon={Briefcase} where="UAE" title="Earned in UAE" big={aedFmt(uae.earned)} sub={`≈ ${inrShort(uae.earned * FX)}`} total={Math.max(uae.earned, uae.spent + uae.emi + uae.invest + uae.sent)}
            rows={[
              { label: 'Spent in UAE', value: aedFmt(uae.spent), amount: uae.spent, color: '#6A55E8' },
              ...(uae.emi > 0 ? [{ label: 'EMIs', value: aedFmt(uae.emi), amount: uae.emi, color: '#F29A2E' }] : []),
              ...(uae.invest > 0 ? [{ label: 'Invested', value: aedFmt(uae.invest), amount: uae.invest, color: '#2FB67C' }] : []),
              { label: 'Sent to India', value: aedFmt(uae.sent), amount: uae.sent, color: '#0EA5E9' },
              { label: uaeLeft >= 0 ? 'Left in UAE' : 'Short in UAE', value: aedFmt(uaeLeft), amount: Math.max(uaeLeft, 0), color: '#CBD5E1' },
            ]} />
          <Flow />
          <Stage icon={Globe} where="India" title="Landed in NRE" big={inrFmt(f.landed)} total={0}
            sub={`${aedFmt(f.sentAed)} sent · ${remits.length} transfer${remits.length === 1 ? '' : 's'}${f.rate ? ` · ₹${f.rate.toFixed(2)}/AED` : ''}`}
            rows={[
              ...(['matched', 'via NRO', 'estimated', 'received'] as const).filter(s => remits.some(r => r.source === s)).map(s => ({
                label: `${STATUS[s].label} (${remits.filter(r => r.source === s).length})`, value: inrShort(remits.filter(r => r.source === s).reduce((a, r) => a + r.inr, 0)),
                amount: remits.filter(r => r.source === s).reduce((a, r) => a + r.inr, 0), color: STATUS[s].color })),
            ]} />
          <Flow />
          <Stage icon={Landmark} where="India" title="NRE account" big={inrFmt(nreIn)} sub={f.back > 0 ? `Where remittances land · incl. ${inrShort(f.back)} back from NRO` : 'Where remittances land'} total={Math.max(nreIn, f.moved + nreUsed)}
            rows={[
              { label: 'Moved to NRO', value: inrShort(f.moved), amount: f.moved, color: '#3B8EF0' },
              ...(nreUsed > 0 ? [{ label: 'Paid from NRE (EMIs, SIPs…)', value: inrShort(nreUsed), amount: nreUsed, color: '#2FB67C' }] : []),
              { label: nreLeft >= 0 ? 'Kept in NRE' : 'From NRE savings', value: inrShort(nreLeft), amount: Math.max(nreLeft, 0), color: '#CBD5E1' },
            ]} />
          <Flow />
          <Stage icon={Wallet} where="India" title="NRO & daily spending" big={inrFmt(nroIn)} sub={nro.earned > 0 ? `incl. ${inrShort(nro.earned)} earned in India` : 'Moved in from NRE'} total={Math.max(nroIn, nro.spent + nro.emi + nro.invest)}
            rows={[
              { label: 'Spent', value: inrShort(nro.spent), amount: nro.spent, color: '#6A55E8' },
              { label: 'EMIs', value: inrShort(nro.emi), amount: nro.emi, color: '#F29A2E' },
              { label: 'Invested', value: inrShort(nro.invest), amount: nro.invest, color: '#2FB67C' },
              ...(f.back > 0 ? [{ label: 'Moved back to NRE', value: inrShort(f.back), amount: f.back, color: '#7C3AED' }] : []),
              { label: nroLeft >= 0 ? 'Left over' : 'Drawn from savings', value: inrShort(nroLeft), amount: Math.max(nroLeft, 0), color: '#CBD5E1' },
            ]} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
          <KpiTile label="Sent to India" value={aedFmt(f.sentAed)} delta={`${remits.length} transfer${remits.length === 1 ? '' : 's'} · a move, not spending`} tint={2} icon={ArrowRightLeft} />
          <KpiTile label="India income" value={inrShort(indiaIn)} delta={f.earnedIndia > 0 ? `${inrShort(f.landed)} from UAE + ${inrShort(f.earnedIndia)} earned` : 'landed in NRE from UAE'} tint={1} icon={Landmark} href="/dashboard/income" />
          <KpiTile label="Average rate" value={f.rate ? `₹${f.rate.toFixed(2)}` : '—'} delta={f.rate ? `per AED · today ₹${FX.toFixed(2)}` : 'needs a ₹ credit to compare'} tint={0} icon={Globe} href="/dashboard/fx" />
          <KpiTile label="India saved" value={inrShort(indiaSaved)} tone={indiaSaved >= 0 ? 'good' : 'bad'} tint={3} icon={CheckCircle2}
            delta={indiaIn > 0 ? `${Math.round(indiaSaved / indiaIn * 100)}% · incl. ${inrShort(indiaInvest)} invested` : '—'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 md:gap-4 items-start">
          <ListCard title="Transfers to India" sub={`${remits.length} in ${rangeLabel} · each AED debit paired with the ₹ that landed`}
            head={['Transfer', 'Status', 'Rate', 'Landed']}
            empty={remits.length === 0 ? <div className="text-center py-10 text-[13px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>No transfers in {rangeLabel}.</div> : undefined}>
            {remits.map(r => {
              const st = STATUS[r.source]
              const from = acc(r.out?.account_id)?.name, to = acc(r.in?.account_id)?.name
              return (
                <ListRow key={r.id} color={st.color} initial={<ArrowRightLeft size={15} />}
                  title={r.aed ? `${aedFmt(r.aed)} → ${inrFmt(r.inr)}` : inrFmt(r.inr)}
                  sub={[r.sentOn ? `Sent ${fmtDay(r.sentOn)}${from ? ` from ${from}` : ''}` : null, `landed ${fmtDay(r.landedOn)}${to ? ` in ${to}` : ''}`, st.note].filter(Boolean).join(' · ')}
                  tag={st.label} meta={r.rate ? `₹${r.rate.toFixed(2)}/AED` : '—'}
                  amount={inrFmt(r.inr)} amountSub={r.aed ? aedFmt(r.aed) : undefined} />
              )
            })}
          </ListCard>

          <section className="rounded-[20px] bg-ai px-4 md:px-[22px] py-4 md:py-[18px]" style={{ border: '1px solid #E1DAFF' }}>
            <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--accent2)' }}>✦ Highlights</div>
            {notes.length === 0 && <div className="text-[13px] mt-2" style={{ color: 'var(--text3)' }}>Nothing stands out in {rangeLabel}.</div>}
            {notes.map((n, i) => {
              const s = n.tone === 'good' ? { c: '#1E8F5F', bg: '#E7F7EF', I: CheckCircle2 } : n.tone === 'warn' ? { c: '#B96A0B', bg: '#FFF2E2', I: AlertTriangle } : { c: '#5640D6', bg: '#F0EDFF', I: Info }
              return (
                <div key={i} className="flex gap-3 items-start py-2.5" style={{ borderTop: i ? '1px solid rgba(106,85,232,.12)' : 'none' }}>
                  <span className="w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0" style={{ background: s.bg, color: s.c }}><s.I size={14} /></span>
                  <div className="text-[13px] leading-normal" style={{ color: 'var(--text2)' }}>{n.text}</div>
                </div>
              )
            })}
          </section>
        </div>

        {/* Other moves between your own accounts — shown, never counted */}
        {f.moves.length > 0 && (
          <ListCard title="Moves between your accounts" sub={`${f.moves.length} in ${rangeLabel} · NRE → NRO, card bills, ATM cash — never income or spending`}
            head={['Move', 'Kind', 'Date', 'Amount']}
            footer={f.moves.length > 6 && (
              <button onClick={() => setShowMoves(v => !v)} className="w-full py-3 text-[12.5px] font-semibold flex items-center justify-center gap-1" style={{ color: 'var(--accent)', borderTop: '1px solid var(--line)' }}>
                {showMoves ? <>Show fewer <ChevronUp size={14} /></> : <>Show all {f.moves.length} <ChevronDown size={14} /></>}
              </button>
            )}>
            {(showMoves ? f.moves : f.moves.slice(0, 6)).map((t: any, i: number) => {
              const kind = t._cardSpend ? 'Card bill (counted)' : labelOf(catOf(t))
              return (
                <ListRow key={t.id ?? i} color="#94A3B8" initial={<ArrowRightLeft size={15} />} title={t.merchant || kind}
                  sub={acc(t.account_id)?.name} tag={kind} meta={fmtDay(t.txn_date)}
                  amount={t.currency === 'AED' ? aedFmt(Number(t.amount)) : inrFmt(Number(t.amount))} amountColor="var(--text2)" />
              )
            })}
          </ListCard>
        )}

        <section className="rounded-[16px] px-4 md:px-5 py-3.5" style={{ background: '#FAFAFE', border: '1px solid var(--line)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>How WealthLens counts this</div>
          <ul className="text-[12.5px] leading-relaxed list-disc pl-4 grid md:grid-cols-2 gap-x-8" style={{ color: 'var(--text3)' }}>
            <li><b style={{ color: 'var(--text2)' }}>UAE → India</b> is your own money moving. Its AED debit and ₹ credit are paired and counted once.</li>
            <li><b style={{ color: 'var(--text2)' }}>India income</b> is what lands in NRE. It shows as income in the India view only.</li>
            <li>In the <b style={{ color: 'var(--text2)' }}>All</b> view your UAE salary is the income, so the remittance isn’t added again.</li>
            <li><b style={{ color: 'var(--text2)' }}>NRE → NRO</b>, transfers to your other accounts, card bills and ATM cash are moves: never income or spending.</li>
            <li>Imported transfers with no kind are matched to your own account when the same amount lands in another of yours within 3 days; the rest wait in <b style={{ color: 'var(--text2)' }}>Review</b> for one tap.</li>
            <li><b style={{ color: 'var(--text2)' }}>Family support</b> (allowance to parents or spouse) is spending — the money leaves your accounts.</li>
            <li>Accounts named “NRE” are treated as NRE; your other India accounts as NRO / daily spending.</li>
          </ul>
        </section>
      </>)}

      {adding && <AddTransactionModal onClose={() => setAdding(false)} defaults={{ txn_type: 'transfer', sub_category: 'International', category: 'Transfer', currency: 'AED', merchant: 'Transfer to India' }} />}
    </div>
  )
}
