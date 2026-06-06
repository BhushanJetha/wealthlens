'use client'
import { useState, useMemo, useEffect } from 'react'
import { useViewStore } from '@/store/viewStore'
import { ChevronRight, X, ArrowLeftRight } from 'lucide-react'
import TransferMatrix from '@/components/dashboard/TransferMatrix'

// ─── Column accent definitions ────────────────────────────────────────────────
const UAE_COLOR  = '#D4920A'
const UAE_BG     = '#FEF3C7'
const NRE_COLOR  = '#3B7DD8'
const NRE_BG     = '#EFF6FF'
const NRO_COLOR  = '#3D7A58'
const NRO_BG     = '#F0FDF4'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TxnAccount {
  name: string
  bank_name: string
  account_type: string
  currency: string
  country: string
}
interface Txn {
  id: string
  txn_date: string
  merchant: string
  amount: string | number
  currency: string
  category: string
  sub_category: string
  description?: string
  account_id: string
  accounts?: TxnAccount
  source?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('en-IN') }

function colTotal(txns: Txn[]) {
  return txns.reduce((a, t) => a + Number(t.amount), 0)
}

// ─── Single transaction card ──────────────────────────────────────────────────
function TxnCard({
  txn,
  accentColor,
  bgColor,
  isUAE,
  fxRate,
  liveRate,
  onClick,
}: {
  txn: Txn
  accentColor: string
  bgColor: string
  isUAE: boolean
  fxRate: number
  liveRate: number | null
  onClick: () => void
}) {
  const rate    = liveRate ?? fxRate
  const amount  = Number(txn.amount)
  const lSym    = txn.currency === 'AED' ? 'AED ' : '₹'
  const inrEq   = isUAE ? `≈ ₹${fmt(Math.round(amount * rate))}` : null

  return (
    <div
      onClick={onClick}
      className="rounded-xl px-3 py-2.5 cursor-pointer transition-all"
      style={{
        background: bgColor,
        border: `1px solid ${accentColor}30`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${accentColor}28` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Merchant */}
      <div className="text-[12px] font-bold leading-snug truncate" style={{ color: 'var(--text)' }}>
        {txn.merchant}
      </div>
      {/* Account name if available */}
      {txn.accounts?.name && (
        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text3)' }}>
          {txn.accounts.name}
        </div>
      )}
      {/* Amount + date row */}
      <div className="flex items-end justify-between mt-1.5 gap-2">
        <div>
          <div className="font-mono font-bold text-[14px] leading-none" style={{ color: accentColor }}>
            {lSym}{fmt(amount)}
          </div>
          {inrEq && (
            <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text3)' }}>
              {inrEq}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>{txn.txn_date}</span>
          <span style={{ color: accentColor, opacity: 0.7 }}>↗</span>
        </div>
      </div>
    </div>
  )
}

// ─── Column component ─────────────────────────────────────────────────────────
function PipelineColumn({
  title,
  subtitle,
  txns,
  accentColor,
  bgColor,
  isUAE,
  fxRate,
  liveRate,
  onClickTxn,
}: {
  title: string
  subtitle: string
  txns: Txn[]
  accentColor: string
  bgColor: string
  isUAE: boolean
  fxRate: number
  liveRate: number | null
  onClickTxn: (t: Txn) => void
}) {
  const total = colTotal(txns)
  const lSym  = isUAE ? 'AED ' : '₹'

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden flex-1 min-w-[220px]"
      style={{
        border: `1.5px solid ${accentColor}35`,
        background: '#fff',
      }}
    >
      {/* Column header */}
      <div className="px-4 py-3" style={{ background: accentColor + '12', borderBottom: `1px solid ${accentColor}25` }}>
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
          {title}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>{subtitle}</div>
      </div>

      {/* Cards list */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 460 }}>
        {txns.length === 0 ? (
          <div
            className="rounded-xl px-4 py-6 text-center text-[11px]"
            style={{
              border: `1.5px dashed ${accentColor}50`,
              color: 'var(--text3)',
              background: bgColor,
            }}
          >
            No transfers in this period
          </div>
        ) : (
          txns.map((t, i) => (
            <TxnCard
              key={t.id ?? i}
              txn={t}
              accentColor={accentColor}
              bgColor={bgColor}
              isUAE={isUAE}
              fxRate={fxRate}
              liveRate={liveRate}
              onClick={() => onClickTxn(t)}
            />
          ))
        )}
      </div>

      {/* Column footer — total */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderTop: `1px solid ${accentColor}25`, background: accentColor + '08' }}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>
          Total
        </div>
        <div className="font-mono font-bold text-[13px]" style={{ color: accentColor }}>
          {lSym}{fmt(Math.round(total))}
        </div>
      </div>
    </div>
  )
}

// ─── Detail popup ─────────────────────────────────────────────────────────────
function TxnDetailPopup({
  txn,
  fxRate,
  liveRate,
  onClose,
}: {
  txn: Txn
  fxRate: number
  liveRate: number | null
  onClose: () => void
}) {
  const rate   = liveRate ?? fxRate
  const amount = Number(txn.amount)
  const isAED  = txn.currency === 'AED'
  const lSym   = isAED ? 'AED ' : '₹'
  const col    = isAED ? UAE_COLOR : txn.sub_category === 'Internal' ? NRO_COLOR : NRE_COLOR

  const rows: { label: string; value: string }[] = [
    { label: 'Date',        value: txn.txn_date },
    { label: 'Merchant',    value: txn.merchant },
    { label: 'Amount',      value: `${lSym}${fmt(amount)}` },
    ...(isAED ? [{ label: 'INR Equivalent', value: `≈ ₹${fmt(Math.round(amount * rate))}` }] : []),
    { label: 'Currency',    value: txn.currency },
    { label: 'Category',    value: txn.category ?? '—' },
    { label: 'Sub-Category', value: txn.sub_category ?? '—' },
    ...(txn.description ? [{ label: 'Description', value: txn.description }] : []),
    ...(txn.accounts?.name ? [{ label: 'Account', value: `${txn.accounts.name} · ${txn.accounts.bank_name ?? ''}` }] : []),
    ...(txn.source ? [{ label: 'Source', value: txn.source === 'statement_upload' ? 'Parsed (Statement)' : txn.source === 'voice' ? 'Voice' : txn.source === 'bill_upload' ? 'Bill Scan' : 'Manual' }] : []),
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 wl-popup-overlay"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="wl-popup-panel rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderTop: `3px solid ${col}`,
          maxHeight: '80vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: col }}>
              Transfer Detail
            </div>
            <div className="text-[20px] font-bold font-mono leading-none" style={{ color: 'var(--text)' }}>
              {lSym}{fmt(amount)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-gray-100"
            style={{ color: 'var(--text3)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Detail rows */}
        <div className="overflow-y-auto p-4 space-y-2">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: 'var(--text3)' }}>{label}</span>
              <span className="text-[11px] font-mono text-right" style={{ color: 'var(--text)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────
export default function TransfersClient({ transactions }: { transactions: Txn[] }) {
  const { fromMonth, toMonth, fxRate: FX } = useViewStore()
  const [openTxn,  setOpenTxn]  = useState<Txn | null>(null)
  const [liveRate, setLiveRate] = useState<number | null>(null)
  const [rateDate, setRateDate] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fx-rate')
      .then(r => r.json())
      .then(d => { setLiveRate(d.rate); setRateDate(d.date) })
      .catch(() => {})
  }, [])

  const inRange = (d: string) => {
    const m = d?.slice(0, 7) ?? ''
    return m >= fromMonth && m <= toMonth
  }

  const rangeLabel = fromMonth === toMonth
    ? new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${new Date(fromMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(toMonth + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`

  // ── Column filters ──────────────────────────────────────────────────────────
  const uaeOutgoing = useMemo(() =>
    transactions.filter(t =>
      inRange(t.txn_date) &&
      t.currency === 'AED' &&
      (t.sub_category === 'International' || t.category === 'Transfer')
    ),
    [transactions, fromMonth, toMonth]
  )

  const nreReceived = useMemo(() =>
    transactions.filter(t =>
      inRange(t.txn_date) &&
      t.currency === 'INR' &&
      (t.sub_category === 'International' || t.category === 'NRI Transfer')
    ),
    [transactions, fromMonth, toMonth]
  )

  const nroSettled = useMemo(() =>
    transactions.filter(t =>
      inRange(t.txn_date) &&
      t.currency === 'INR' &&
      (t.sub_category === 'Internal' || t.category === 'Loan Received')
    ),
    [transactions, fromMonth, toMonth]
  )

  // ── All-time lists (no date-range filter) for the year/month matrix ──────────
  const allUae = useMemo(() => transactions.filter(t => t.currency === 'AED' && (t.sub_category === 'International' || t.category === 'Transfer')), [transactions])
  const allNre = useMemo(() => transactions.filter(t => t.currency === 'INR' && (t.sub_category === 'International' || t.category === 'NRI Transfer')), [transactions])
  const allNro = useMemo(() => transactions.filter(t => t.currency === 'INR' && (t.sub_category === 'Internal' || t.category === 'Loan Received')), [transactions])

  // ── Summary totals ──────────────────────────────────────────────────────────
  const totalAED = colTotal(uaeOutgoing)
  const totalNRE = colTotal(nreReceived)
  const totalNRO = colTotal(nroSettled)
  const rate     = liveRate ?? FX

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <ArrowLeftRight size={20} style={{ color: UAE_COLOR }} />
            Money Transfer Pipeline
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            UAE → India transfers · {rangeLabel}
            {liveRate && (
              <span className="ml-2 font-mono" style={{ color: 'var(--gold)' }}>
                · Live: 1 AED = ₹{liveRate.toFixed(2)}{rateDate ? ` (${rateDate})` : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div className="wl-card p-4">
        <div className="flex flex-wrap gap-6 items-center">
          {/* UAE Sent */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: UAE_COLOR }}>
              UAE Sent · {rangeLabel}
            </div>
            <div className="font-mono font-bold text-[22px] leading-none" style={{ color: UAE_COLOR }}>
              AED {fmt(Math.round(totalAED))}
            </div>
            <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text3)' }}>
              ≈ ₹{fmt(Math.round(totalAED * rate))}
            </div>
          </div>

          <ChevronRight size={18} style={{ color: 'var(--text3)', opacity: 0.4 }} />

          {/* NRE Received */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NRE_COLOR }}>
              NRE Received
            </div>
            <div className="font-mono font-bold text-[22px] leading-none" style={{ color: NRE_COLOR }}>
              ₹{fmt(Math.round(totalNRE))}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
              {nreReceived.length} transaction{nreReceived.length !== 1 ? 's' : ''}
            </div>
          </div>

          <ChevronRight size={18} style={{ color: 'var(--text3)', opacity: 0.4 }} />

          {/* NRO Settled */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NRO_COLOR }}>
              NRO Settled
            </div>
            <div className="font-mono font-bold text-[22px] leading-none" style={{ color: NRO_COLOR }}>
              ₹{fmt(Math.round(totalNRO))}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
              {nroSettled.length} transaction{nroSettled.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Efficiency ratio */}
          {totalAED > 0 && totalNRE > 0 && (
            <>
              <div className="ml-auto pl-6" style={{ borderLeft: '1px solid var(--border)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text3)' }}>
                  Effective Rate
                </div>
                <div className="font-mono font-bold text-[20px] leading-none" style={{ color: 'var(--text)' }}>
                  ₹{(totalNRE / totalAED).toFixed(2)}
                  <span className="text-[12px] font-normal ml-1" style={{ color: 'var(--text3)' }}>/AED</span>
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  vs live ₹{rate.toFixed(2)}/AED
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Pipeline columns ─────────────────────────────────────────────────── */}
      <div className="flex gap-3 items-start">

        {/* Column 1: UAE Outgoing */}
        <PipelineColumn
          title="UAE Outgoing"
          subtitle="AED sent from UAE bank"
          txns={uaeOutgoing}
          accentColor={UAE_COLOR}
          bgColor={UAE_BG}
          isUAE={true}
          fxRate={FX}
          liveRate={liveRate}
          onClickTxn={setOpenTxn}
        />

        {/* Arrow */}
        <div className="flex-shrink-0 flex items-center justify-center pt-20">
          <ChevronRight size={24} style={{ color: 'var(--text3)', opacity: 0.4 }} />
        </div>

        {/* Column 2: NRE Received */}
        <PipelineColumn
          title="NRE Received"
          subtitle="INR credited to NRE account"
          txns={nreReceived}
          accentColor={NRE_COLOR}
          bgColor={NRE_BG}
          isUAE={false}
          fxRate={FX}
          liveRate={liveRate}
          onClickTxn={setOpenTxn}
        />

        {/* Arrow */}
        <div className="flex-shrink-0 flex items-center justify-center pt-20">
          <ChevronRight size={24} style={{ color: 'var(--text3)', opacity: 0.4 }} />
        </div>

        {/* Column 3: NRO Settled */}
        <PipelineColumn
          title="NRO Settled"
          subtitle="INR moved NRE → NRO"
          txns={nroSettled}
          accentColor={NRO_COLOR}
          bgColor={NRO_BG}
          isUAE={false}
          fxRate={FX}
          liveRate={liveRate}
          onClickTxn={setOpenTxn}
        />
      </div>

      {/* ── Year-by-year transfer matrix (click a year → month detail) ────────── */}
      <div className="wl-card p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <ArrowLeftRight size={14} style={{ color: NRE_COLOR }} />
          <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Transfers by Year</div>
          <span className="text-[10px]" style={{ color: 'var(--text3)' }}>click a year to see the month-by-month breakdown</span>
        </div>
        <TransferMatrix cols={[
          { key: 'uae', label: 'UAE Outgoing', sym: 'AED ', color: UAE_COLOR, txns: allUae },
          { key: 'nre', label: 'NRE Received', sym: '₹',    color: NRE_COLOR, txns: allNre },
          { key: 'nro', label: 'NRO Settled',  sym: '₹',    color: NRO_COLOR, txns: allNro },
        ]} />
      </div>

      {/* ── Legend / help row ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 pt-1">
        {[
          { color: UAE_COLOR, bg: UAE_BG, label: 'UAE Outgoing', desc: 'AED transfers with sub_category=International' },
          { color: NRE_COLOR, bg: NRE_BG, label: 'NRE Received', desc: 'INR transfers with sub_category=International' },
          { color: NRO_COLOR, bg: NRO_BG, label: 'NRO Settled',  desc: 'INR transfers with sub_category=Internal'       },
        ].map(({ color, bg, label, desc }) => (
          <div key={label} className="flex items-center gap-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
            <span className="font-semibold" style={{ color: 'var(--text2)' }}>{label}</span>
            <span style={{ color: 'var(--text3)' }}>— {desc}</span>
          </div>
        ))}
      </div>

      {/* ── Transaction detail popup ─────────────────────────────────────────── */}
      {openTxn && (
        <TxnDetailPopup
          txn={openTxn}
          fxRate={FX}
          liveRate={liveRate}
          onClose={() => setOpenTxn(null)}
        />
      )}
    </div>
  )
}
