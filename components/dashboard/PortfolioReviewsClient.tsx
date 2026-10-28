'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileBarChart2, ChevronRight, CalendarClock } from 'lucide-react'
import { fmtCompact } from '@/lib/format'
import { KIND_LABEL, type ReviewKind } from '@/lib/portfolio/review'
import { PageHeader, InsightBar, Panel } from '@/components/ui/kit'

// Portfolio reports (design v2): the review history, newest first, and
// "Run a review now". Reviews follow India's financial year.
export default function PortfolioReviewsClient({ reviews, ready, next }: { reviews: any[]; ready: boolean; next: { kind: string; label: string; end: string } }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(kind: 'now' | 'auto') {
    setBusy(true); setError('')
    const res = await fetch('/api/portfolio/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!j.id) { setError(j.error ?? 'Could not make the review.'); return }
    router.push(`/dashboard/portfolio/reviews/${j.id}`)
  }
  const hasLast = reviews.some(r => r.kind === next.kind && r.period_end === next.end)

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Portfolio reports" sub="A review after every quarter — and whenever you want one"
        actions={ready ? <button onClick={() => run('now')} disabled={busy} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 36 }}><FileBarChart2 size={14} />{busy ? 'Reviewing…' : 'Run a review now'}</button> : undefined} />
      <InsightBar text={!ready ? 'Run migration 032 in Supabase to get portfolio reviews.'
        : reviews.length ? `${reviews.length} review${reviews.length === 1 ? '' : 's'} so far. The next one is made after the quarter ends — the first time you open the app.`
        : 'No reviews yet. The first is made automatically for the last finished quarter, or run one now.'}
        prompt="How should I use quarterly, half-yearly and yearly portfolio reviews?" />
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-2.5 min-w-0">
          {ready && !hasLast && (
            <button onClick={() => run('auto')} disabled={busy} className="wl-card px-4 py-3.5 flex items-center gap-3 text-left disabled:opacity-60" style={{ borderStyle: 'dashed' }}>
              <CalendarClock size={20} style={{ color: 'var(--accent)' }} />
              <span className="flex-1"><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>{KIND_LABEL[next.kind as ReviewKind]} — {next.label}</span>
                <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>Ended {next.end}. Make it now.</span></span>
              <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
            </button>
          )}
          {reviews.map(r => (
            <Link key={r.id} href={`/dashboard/portfolio/reviews/${r.id}`} className="wl-card px-4 md:px-5 py-3.5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><FileBarChart2 size={18} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{r.label} {!r.seen_at && <span className="ml-1 rounded-full px-1.5 py-[1px] text-[10px] font-semibold align-middle" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>New</span>}</span>
                <span className="block text-[12px] truncate" style={{ color: 'var(--text3)' }}>{KIND_LABEL[r.kind as ReviewKind]} · {r.period_start ? `${r.period_start} → ` : ''}{r.period_end}{r.totals ? ` · invested ${fmtCompact(r.totals.invested, 'INR')}` : ''}{r.actions ? ` · ${r.actions.length} actions` : ''}</span>
              </span>
              <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
            </Link>
          ))}
        </div>
        <Panel title="How reviews work">
          <ul className="mt-2 flex flex-col gap-2 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>
            <li><b>Quarterly</b> (after June and December): every holding re-checked, what to add, the actions.</li>
            <li><b>Half-yearly</b> (after September): plus a rebalancing check against your target mix.</li>
            <li><b>Yearly</b> (after March): plus tax — tax-free gains to use, losses to book — and a yearly checklist.</li>
            <li><b>Any time</b>: “Run a review now” covers the time since the last one.</li>
          </ul>
          <p className="text-[11.5px] mt-2.5" style={{ color: 'var(--text4)' }}>Made the first time you open the app after a period ends; the bell tells you. India’s financial year (April–March), to line up with tax.</p>
        </Panel>
      </div>
    </div>
  )
}
