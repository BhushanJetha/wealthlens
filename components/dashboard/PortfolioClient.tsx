'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Compass, HandCoins, FileBarChart2, ChevronDown, ExternalLink, Scale, ListChecks, TrendingUp, Sparkles } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { VERDICT, CLS_LABEL, type Verdict } from '@/lib/portfolio/advice'
import { EXAMPLE_NOTE } from '@/lib/portfolio/catalog'
import type { Portfolio } from '@/lib/portfolio/build'
import type { Cls } from '@/lib/portfolio/holdings'
import { PageHeader, InsightBar, KpiTile, KpiGrid, Panel, Segmented } from '@/components/ui/kit'

const CLS_COLOR: Record<Cls, string> = { equity: '#6A55E8', debt: '#2FB67C', gold: '#F29A2E', cash: '#3B8EF0' }
const pctTxt = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}%`

// Portfolio manager (design v2): your investments reviewed the way a portfolio
// manager would — each holding against live returns and your target mix, what
// to add (with named examples), and what to do first. Rules on your own data;
// suggestions, not licensed advice.
export default function PortfolioClient({ p, fx, reviews, reviewsReady, wealthReady, perfCount }: {
  today: string; fx: number; p: Portfolio; reviews: { id: string; label: string; kind: string; period_end: string; seen_at: string | null }[]
  reviewsReady: boolean; wealthReady: boolean; perfCount: number
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<'act' | 'watch' | 'keep' | 'all'>('act')
  const [open, setOpen] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const inr = (n: number) => fmtCompact(n, 'INR')
  const valIn = (v: number, c: string) => fmtCompact(v, c === 'AED' ? 'AED' : 'INR')
  const act = p.reviews.filter(r => ['switch', 'trim', 'check'].includes(r.verdict))
  const counts = { act: act.length, watch: p.reviews.filter(r => r.verdict === 'watch').length, keep: p.reviews.filter(r => r.verdict === 'keep').length, all: p.reviews.length }
  const shown = filter === 'all' ? p.reviews : filter === 'act' ? act : p.reviews.filter(r => r.verdict === filter)
  const mix = p.add.mix
  const big = p.drift[0]

  async function runReview() {
    setRunning(true); setError('')
    const res = await fetch('/api/portfolio/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'now' }) })
    const j = await res.json().catch(() => ({}))
    setRunning(false)
    if (!res.ok || !j.id) { setError(j.error ?? 'Could not run the review.'); return }
    router.push(`/dashboard/portfolio/reviews/${j.id}`)
  }

  // What to do first: holdings to act on, then the biggest addition
  const todo = [
    ...act.slice(0, 4).map(r => ({ id: r.h.key, verdict: r.verdict as Verdict, title: `${VERDICT[r.verdict].label}: ${r.h.name}`, detail: r.action ?? r.reasons[0] })),
    ...p.add.adds.slice(0, 2).map(a => ({ id: a.id, verdict: 'keep' as Verdict, title: a.title, detail: a.how })),
  ].slice(0, 6)

  const insight = !p.reviews.length ? 'Add your investments (Investments, or Property & assets) and the portfolio manager reviews each one against live returns and your target mix.'
    : `${p.reviews.length} holdings reviewed: ${counts.act} to act on, ${counts.watch} to watch, ${counts.keep} fine as they are. ${big && Math.abs(big.off) >= 5 ? `${CLS_LABEL[big.cls]} is ${Math.round(big.now)}% vs your ${big.target}% target.` : 'Your mix is close to target.'}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Portfolio manager" sub="Every holding reviewed against live returns and your target mix — what to keep, what to change, what to add"
        actions={<>
          <Link href="/dashboard/portfolio/need-money" className="wl-btn" style={{ height: 36 }}><HandCoins size={14} />Need money?</Link>
          {reviewsReady && <button onClick={runReview} disabled={running} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 36 }}><FileBarChart2 size={14} />{running ? 'Reviewing…' : 'Run a review now'}</button>}
        </>} />
      <InsightBar text={insight} prompt={`Act as my portfolio manager. Profile: ${p.rp?.profile.label ?? 'not answered'}; target ${Object.entries(p.target.mix).map(([k, v]) => `${k} ${v}%`).join(', ')}; now ${Object.entries(mix.pct).map(([k, v]) => `${k} ${Math.round(v)}%`).join(', ')}. Holdings: ${p.reviews.slice(0, 25).map(r => `${r.h.name} (${r.h.sub}) ${valIn(r.h.value, r.h.currency)} → ${VERDICT[r.verdict].label}: ${r.reasons[0] ?? ''}`).join('; ')}`} />
      <p className="text-[11.5px] -mt-1.5 px-0.5" style={{ color: 'var(--text4)' }}>Suggestions come from rules applied to your own data and live prices — not licensed financial advice. Check costs, exit loads and tax before acting.</p>
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
      {!reviewsReady && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>Run migration 032 in Supabase to save your profile and get quarterly, half-yearly and yearly reviews.</div>}

      <KpiGrid>
        <KpiTile label="Invested" value={inr(p.investedInr)} tint={0} icon={TrendingUp} delta={`${p.reviews.length} holdings · ₹, AED at today’s rate`} />
        <KpiTile label="To act on" value={String(counts.act)} tint={2} icon={ListChecks} tone={counts.act ? 'bad' : 'good'} delta={counts.act ? 'Switch, trim or check' : 'Nothing urgent'} />
        <KpiTile label="Your profile" value={p.rp?.profile.label ?? 'Not set'} tint={3} icon={Compass} delta={p.rp ? `Risk score ${p.rp.score}/100` : 'Answer 10 questions'} href="/dashboard/portfolio/profile" />
        <KpiTile label="Off target" value={big ? `${Math.round(Math.abs(big.off))} pts` : '—'} tint={1} icon={Scale} tone={big && Math.abs(big.off) >= 10 ? 'bad' : 'neutral'} delta={big ? `${CLS_LABEL[big.cls]} ${Math.round(big.now)}% vs ${big.target}%` : 'No investments yet'} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          {todo.length > 0 && (
            <Panel title="Do this first">
              <ol className="mt-2 flex flex-col gap-2">
                {todo.map((t, i) => (
                  <li key={t.id} className="flex gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{i + 1}</span>
                    <span className="min-w-0"><span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t.title}</span>
                      <span className="block text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>{t.detail}</span></span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <section className="wl-card px-4 md:px-5 py-4" aria-label="Holdings review">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Every holding, reviewed</h2>
              <Segmented label="Filter" value={filter} onChange={setFilter} options={[
                { value: 'act', label: `Act · ${counts.act}` }, { value: 'watch', label: `Watch · ${counts.watch}` }, { value: 'keep', label: `Keep · ${counts.keep}` }, { value: 'all', label: 'All' }]} />
            </div>
            {perfCount === 0 && p.reviews.some(r => r.h.type === 'mf' || r.h.type === 'stock') && <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>Live returns couldn’t be loaded just now (or funds aren’t linked to their NAV yet) — verdicts use what’s known.</p>}
            <ul className="mt-2">
              {shown.length === 0 && <li className="text-[12.5px] py-4 text-center" style={{ color: 'var(--text3)' }}>Nothing here.</li>}
              {shown.map(r => {
                const v = VERDICT[r.verdict], isOpen = open === r.h.key
                return (
                  <li key={r.h.key} style={{ borderTop: '1px solid var(--track)' }}>
                    <button onClick={() => setOpen(isOpen ? null : r.h.key)} className="w-full flex items-center gap-3 py-2.5 text-left" aria-expanded={isOpen}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.h.name}</span>
                        <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>
                          {r.h.sub}{r.perf?.r3y != null ? ` · 3y ${pctTxt(r.perf.r3y)}/yr` : r.perf?.r1y != null ? ` · 1y ${pctTxt(r.perf.r1y)}` : ''}{r.perf?.bench && (r.perf.bench.r3y ?? r.perf.bench.r1y) != null ? ` (${r.perf.bench.name} ${pctTxt((r.perf.r3y != null ? r.perf.bench.r3y : r.perf.bench.r1y) ?? 0)})` : ''}
                        </span>
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block text-[13.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{valIn(r.h.value, r.h.currency)}</span>
                        {r.gainPct != null && <span className="block text-[11px] tabular-nums" style={{ color: r.gainPct >= 0 ? 'var(--pos-text)' : '#DC2626' }}>{pctTxt(r.gainPct)}</span>}
                      </span>
                      <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold flex-shrink-0 w-[118px] text-center hidden sm:block" style={{ background: v.bg, color: v.c }}>{v.label}</span>
                      <ChevronDown size={15} className="flex-shrink-0" style={{ color: 'var(--text4)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>
                    <span className="sm:hidden inline-block rounded-full px-2.5 py-[2px] text-[10.5px] font-semibold -mt-1 mb-2" style={{ background: v.bg, color: v.c }}>{v.label}</span>
                    {isOpen && (
                      <div className="pb-3 -mt-0.5 pl-0.5">
                        <ul className="flex flex-col gap-1 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>{r.reasons.map((x, i) => <li key={i}>• {x}</li>)}</ul>
                        {r.action && <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px] font-medium" style={{ background: v.bg, color: v.c }}>{r.action}</div>}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {p.add.adds.length > 0 && (
            <section className="flex flex-col gap-2.5" aria-label="What to add">
              <div className="px-0.5">
                <h2 className="text-[14px] md:text-[15px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}><Sparkles size={15} style={{ color: 'var(--accent)' }} />What to add</h2>
                <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text4)' }}>{EXAMPLE_NOTE}</p>
              </div>
              {p.add.adds.map(a => (
                <div key={a.id} className="wl-card px-4 md:px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{a.title}</div>
                      <div className="text-[12.5px] mt-0.5 leading-snug" style={{ color: 'var(--text3)' }}>{a.why}</div>
                    </div>
                    <span className="text-[15px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{fmtMoney(a.amount, a.currency)}</span>
                  </div>
                  <div className="text-[12.5px] mt-2 rounded-lg px-3 py-2" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{a.how}</div>
                  {a.examples.length > 0 && (
                    <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      {a.examples.map(e => (
                        <li key={e.name} className="rounded-lg px-3 py-2 text-[12px]" style={{ border: '1px solid var(--line)' }}>
                          <span className="block font-semibold" style={{ color: 'var(--text)' }}>{e.name}</span>
                          <span className="block" style={{ color: 'var(--text3)' }}>{e.kind} · {e.where}</span>
                          <span className="block" style={{ color: 'var(--text4)' }}>{e.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4">
          <Panel title="Your mix vs target" right={<Link href="/dashboard/portfolio/profile" className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>{p.target.source === 'yours' ? 'Edit' : 'Set yours'}</Link>}>
            <ul className="mt-3 flex flex-col gap-3">
              {(['equity', 'debt', 'gold', 'cash'] as Cls[]).map(c => (
                <li key={c}>
                  <div className="flex justify-between text-[12.5px]">
                    <span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: CLS_COLOR[c] }} />{CLS_LABEL[c]}</span>
                    <span className="tabular-nums" style={{ color: 'var(--text)' }}><b>{Math.round(mix.pct[c])}%</b> <span style={{ color: 'var(--text4)' }}>/ {p.target.mix[c]}%</span></span>
                  </div>
                  <div className="relative h-2 rounded-full mt-1" style={{ background: 'var(--track)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, mix.pct[c])}%`, background: CLS_COLOR[c] }} />
                    <span aria-hidden className="absolute -top-1 w-[2px] h-4 rounded" style={{ left: `${p.target.mix[c]}%`, background: 'var(--text)' }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--text4)' }}>
              The line is your target{p.target.source === 'default' ? ' (Balanced, until you answer the questions)' : p.target.source === 'answers' ? ` (${p.rp?.profile.label}, from your answers)` : ''}. Investments only — not your emergency fund, property or gratuity. {inr(mix.total)} in total.
            </p>
            {p.add.over.length > 0 && <p className="text-[12px] mt-2 leading-snug" style={{ color: 'var(--text2)' }}>{p.add.over.map(o => `${CLS_LABEL[o.cls]} is over target`).join('; ')} — rather than selling (tax), point new money at what’s under.</p>}
          </Panel>

          {!p.rp && (
            <Link href="/dashboard/portfolio/profile" className="rounded-[18px] px-4 md:px-5 py-4 flex items-start gap-3" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
              <Compass size={20} style={{ color: 'var(--accent)' }} className="flex-shrink-0 mt-0.5" />
              <span><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--accent2)' }}>Answer 10 quick questions</span>
                <span className="block text-[12px] mt-0.5" style={{ color: 'var(--accent2)' }}>Your age, when you need the money, how you’d react to a fall — so the target mix and suggestions fit you.</span></span>
            </Link>
          )}

          <Panel title="Reports" right={<Link href="/dashboard/portfolio/reviews" className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>All</Link>}>
            {!reviewsReady ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Run migration 032 to get reviews.</p>
              : !reviews.length ? <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>A review is made after every quarter (half-yearly in Sept, yearly in March, India’s financial year) the first time you open the app. Or run one now.</p>
              : <ul className="mt-1">{reviews.slice(0, 4).map(r => (
                  <li key={r.id}><Link href={`/dashboard/portfolio/reviews/${r.id}`} className="flex justify-between gap-2 py-2 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                    <span style={{ color: 'var(--text)' }}>{r.label}{!r.seen_at && <span className="ml-1.5 rounded-full px-1.5 text-[10px] font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>New</span>}</span>
                    <ExternalLink size={13} style={{ color: 'var(--text4)' }} /></Link></li>))}</ul>}
          </Panel>

          <Link href="/dashboard/portfolio/need-money" className="wl-card px-4 md:px-5 py-3.5 flex items-center gap-3">
            <HandCoins size={20} style={{ color: 'var(--accent)' }} />
            <span className="flex-1"><span className="block text-[13.5px] font-semibold" style={{ color: 'var(--text)' }}>Need money for something?</span>
              <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>See where to take it from — cheapest first, goals and locked money left alone.</span></span>
          </Link>
          {!wealthReady && <p className="text-[11.5px] px-1" style={{ color: 'var(--text4)' }}>Property and investments held abroad will count once migration 032 is run.</p>}
        </div>
      </div>
    </div>
  )
}
