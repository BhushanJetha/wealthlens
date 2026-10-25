'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Landmark, CreditCard, Camera, Mic, MessageSquareText, PieChart, LineChart, FileSpreadsheet, FileDown, PenLine, CalendarClock, Layers, ShieldCheck } from 'lucide-react'
import { localToday, daysBetween, fmtDay } from '@/lib/insights'
import { PageHeader, InsightBar, LearnStrip, KpiTile, Panel } from '@/components/ui/kit'
import BankStatementUploadModal from '@/components/forms/BankStatementUploadModal'
import CreditCardUploadModal from '@/components/forms/CreditCardUploadModal'
import BillImageUploadModal from '@/components/forms/BillImageUploadModal'
import TransactionVoiceModal from '@/components/forms/TransactionVoiceModal'
import MessageParseModal from '@/components/forms/MessageParseModal'
import HoldingsUploadModal from '@/components/forms/HoldingsUploadModal'

type Modal = 'bank' | 'card' | 'bill' | 'voice' | 'message' | 'mf' | 'stocks'
const MODALS: Modal[] = ['bank', 'card', 'bill', 'voice', 'message', 'mf', 'stocks']

// What each way of importing does — `ai` is said plainly so nobody is
// surprised where their data goes.
const WAYS: { k: Modal; t: string; d: string; how: string; ai: boolean; icon: typeof Landmark; c: string; bg: string }[] = [
  { k: 'bank', t: 'Bank statement', d: 'PDF from any UAE or Indian bank. Password-protected files work too.', how: 'Read on our server, no AI', ai: false, icon: Landmark, c: '#6A55E8', bg: '#F0EDFF' },
  { k: 'card', t: 'Credit card statement', d: 'Adds the transactions and updates the card balance, minimum due and due date.', how: 'Read on our server, no AI', ai: false, icon: CreditCard, c: '#3B8EF0', bg: '#E7F1FE' },
  { k: 'message', t: 'Bank SMS or email', d: 'Paste a debit or credit alert, or share it to WealthLens from your phone.', how: 'Read on your device, no AI', ai: false, icon: MessageSquareText, c: '#2FB67C', bg: '#E7F7EF' },
  { k: 'bill', t: 'Bill or receipt photo', d: 'Snap a receipt; the amount, date and merchant are filled in for you to check.', how: 'Read by Claude (AI)', ai: true, icon: Camera, c: '#F29A2E', bg: '#FFF2E2' },
  { k: 'voice', t: 'Speak or type', d: '"Paid AED 120 at Carrefour yesterday" becomes a transaction you can edit.', how: 'Read by Claude (AI)', ai: true, icon: Mic, c: '#EC5B8C', bg: '#FDECF2' },
  { k: 'mf', t: 'Mutual fund statement', d: 'CAMS or KFintech consolidated statement (CAS) PDF.', how: 'Read on our server, no AI', ai: false, icon: PieChart, c: '#16A34A', bg: '#F0FDF4' },
  { k: 'stocks', t: 'Stock holdings', d: 'Holdings statement PDF from your broker or depository.', how: 'Read on our server, no AI', ai: false, icon: LineChart, c: '#0891B2', bg: '#E0F4F8' },
]

const SOURCE_LABEL: Record<string, string> = { statement_upload: 'Statement', sms_parse: 'Message', email_parse: 'Email', manual: 'Added by hand' }

// Import (design v2): one place for every way data gets in. Statements go
// through the local parsers (lib + /api/parse-bank-statement, parse-credit-card);
// you review before anything is saved.
export default function IngestClient({ recent, latestTxn, accounts, initialModal }: {
  recent: any[]; latestTxn: string | null; accounts: any[]; initialModal: string | null
}) {
  const router = useRouter()
  const [modal, setModal] = useState<Modal | null>(MODALS.includes(initialModal as Modal) ? initialModal as Modal : null)
  const [today, setToday] = useState('')
  useEffect(() => { setToday(localToday()) }, [])
  const close = () => { setModal(null); router.refresh() }

  const acctName = (id: string | null) => accounts.find(a => a.id === id)?.name ?? 'No account'
  const fromStatements = recent.filter(t => t.source === 'statement_upload')
  const other = recent.length - fromStatements.length
  const stale = latestTxn && today ? daysBetween(latestTxn, today) : null

  // Statement imports, grouped into batches (same account, saved within a minute)
  const batches: { key: string; account: string; at: string; rows: number; from: string; to: string }[] = []
  for (const t of fromStatements) {
    const key = `${t.account_id}-${String(t.created_at).slice(0, 16)}`
    const b = batches.find(x => x.key === key)
    if (b) { b.rows++; if (t.txn_date < b.from) b.from = t.txn_date; if (t.txn_date > b.to) b.to = t.txn_date }
    else batches.push({ key, account: acctName(t.account_id), at: String(t.created_at).slice(0, 10), rows: 1, from: t.txn_date, to: t.txn_date })
  }
  const covered = new Set(fromStatements.map(t => t.account_id).filter(Boolean)).size
  const bankish = accounts.filter(a => ['savings', 'current', 'credit_card'].includes(a.account_type)).length

  const insight = stale == null
    ? 'Nothing imported yet. Start with a bank statement PDF: we read it on our server without AI, and you review every row before it is saved.'
    : stale > 30
      ? `Your newest transaction is ${stale} days old. Import last month's statements so Home, budgets and bills stay current.`
      : `Your newest transaction is from ${fmtDay(latestTxn!)}.${batches[0] ? ` Last statement import: ${batches[0].account}, ${batches[0].rows} rows on ${fmtDay(batches[0].at)}.` : ''}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Import" sub="Statements, bill photos, voice and messages. You review everything before it's saved."
        actions={<button onClick={() => setModal('bank')} className="wl-btn wl-btn-primary" style={{ height: 34 }}>Upload a statement</button>} />

      <InsightBar text={insight} prompt="Explain how importing works in WealthLens, which method suits which document, and what I should import next to keep my numbers current." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="From statements" value={String(fromStatements.length)} delta="rows, last 90 days" tint={0} icon={FileDown} />
        <KpiTile label="Added another way" value={String(other)} delta="by hand, voice, photo or message" tint={3} icon={PenLine} />
        <KpiTile label="Accounts covered" value={bankish ? `${Math.min(covered, bankish)} of ${bankish}` : String(covered)} delta="imported in 90 days" tint={1} icon={Layers}
          tone={bankish && covered < bankish ? 'bad' : 'neutral'} />
        <KpiTile label="Newest transaction" value={latestTxn ? fmtDay(latestTxn) : '—'} tint={2} icon={CalendarClock}
          tone={stale != null && stale > 30 ? 'bad' : 'neutral'} delta={stale == null ? 'Nothing yet' : stale === 0 ? 'Today' : `${stale} day${stale === 1 ? '' : 's'} ago`} />
      </div>

      <section aria-label="Ways to import">
        <h2 className="text-[14px] md:text-[15px] font-semibold mb-2.5" style={{ color: 'var(--text)' }}>Ways to import</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3.5">
          {WAYS.map(w => (
            <button key={w.k} onClick={() => setModal(w.k)} className="wl-card text-left px-4 md:px-5 py-3.5 md:py-4 flex gap-3 transition-colors hover:border-[var(--accent-border)]">
              <span className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: w.bg, color: w.c }}><w.icon size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{w.t}</span>
                <span className="block text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{w.d}</span>
                <span className="inline-block mt-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                  style={w.ai ? { background: 'var(--accent-bg)', color: 'var(--accent2)' } : { background: '#E7F7EF', color: '#1E8F5F' }}>
                  {w.ai ? '✦ ' : ''}{w.how}
                </span>
              </span>
            </button>
          ))}
          <Link href="/dashboard/investments" className="wl-card px-4 md:px-5 py-3.5 md:py-4 flex gap-3 transition-colors hover:border-[var(--accent-border)]">
            <span className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}><FileSpreadsheet size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Excel for other investments</span>
              <span className="block text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>FDs, gold, bonds, ETFs and LIC each have an Excel import on their page.</span>
              <span className="inline-block mt-2 text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>Go to investments →</span>
            </span>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4 items-start">
        <Panel title="Recent statement imports">
          {batches.length === 0
            ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>No statements imported in the last 90 days.</p>
            : <div className="mt-1.5">
              {batches.slice(0, 8).map((b, i) => (
                <div key={b.key} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                  <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><FileDown size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{b.account}</div>
                    <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>{fmtDay(b.from)} – {fmtDay(b.to)} · imported {fmtDay(b.at)}</div>
                  </div>
                  <div className="text-[13px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>{b.rows} rows</div>
                </div>
              ))}
            </div>}
          {other > 0 && (
            <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>
              Plus {other} added another way: {Object.entries(recent.filter(t => t.source !== 'statement_upload').reduce<Record<string, number>>((o, t) => {
                const l = SOURCE_LABEL[t.source] ?? 'Other'; o[l] = (o[l] ?? 0) + 1; return o
              }, {})).map(([l, n]) => `${l.toLowerCase()} ${n}`).join(', ')}.
            </p>
          )}
        </Panel>

        <Panel title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} style={{ color: '#1E8F5F' }} />Your files</span>}>
          <ul className="text-[12.5px] leading-normal mt-2 flex flex-col gap-1.5 list-disc pl-4" style={{ color: 'var(--text3)' }}>
            <li>Bank, card, mutual fund and stock statements are read on our server by a rule-based reader. No AI sees them, and the PDF isn&apos;t kept.</li>
            <li>Bill photos and voice notes are sent to Claude to read, and only what you confirm is saved.</li>
            <li>Nothing is saved until you review it. Bank statements also untick rows you already have.</li>
          </ul>
        </Panel>
      </div>

      <LearnStrip title="Why categories beat totals" href="/dashboard/expenses/learn" />

      {modal === 'bank' && <BankStatementUploadModal onClose={close} />}
      {modal === 'card' && <CreditCardUploadModal onClose={close} />}
      {modal === 'bill' && <BillImageUploadModal onClose={close} defaultType="expense" />}
      {modal === 'voice' && <TransactionVoiceModal onClose={close} defaultType="expense" />}
      {modal === 'message' && <MessageParseModal onClose={close} />}
      {modal === 'mf' && <HoldingsUploadModal kind="mutual_funds" onClose={close} />}
      {modal === 'stocks' && <HoldingsUploadModal kind="stocks" onClose={close} />}
    </div>
  )
}
