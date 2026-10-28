'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Landmark, TrendingUp, Wallet, ListChecks, Sparkles, Globe2 } from 'lucide-react'
import { fmtCompact, fmtMoney } from '@/lib/format'
import { VERDICT, CLS_LABEL, type Verdict } from '@/lib/portfolio/advice'
import { EXAMPLE_NOTE } from '@/lib/portfolio/catalog'
import { KIND_LABEL, type ReviewData, type ReviewKind } from '@/lib/portfolio/review'
import { ACCESS, type Access, type Cls } from '@/lib/portfolio/holdings'
import { KpiTile, KpiGrid, Panel } from '@/components/ui/kit'

const pctTxt = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10)}%`)
const CLS_COLOR: Record<Cls, string> = { equity: '#6A55E8', debt: '#2FB67C', gold: '#F29A2E', cash: '#3B8EF0' }

// One saved portfolio review (design v2): what you have, what changed since
// the last one, the actions, the mix against target, every holding's verdict,
// what to add, rebalancing and tax (half-yearly / yearly), protection, an AI
// market view when a key is set, and the assumptions behind it all.
export default function PortfolioReviewReport({ review, aiReady }: { review: any; aiReady: boolean }) {
  const router = useRouter()
  const r: ReviewData = review.data
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inr = (n: number) => fmtCompact(n, 'INR')
  const mv = review.market_view as null | { asOf: string; summary: string; points: { title: string; detail: string }[]; sources: { title: string; url: string }[] }

  async function marketView() {
    setBusy(true); setError('')
    const res = await fetch('/api/portfolio/market-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: review.id }) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(j.details ?? j.error ?? 'Could not get the market view.'); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Link href="/dashboard/portfolio/reviews" className="flex items-center gap-1 text-[12px] font-medium self-start" style={{ color: 'var(--text3)' }}><ChevronLeft size={14} />Reports</Link>
      <section className="relative overflow-hidden rounded-[22px] bg-hero text-white p-5 md:px-8 md:py-7" style={{ boxShadow: '0 14px 34px rgba(76,60,190,.25)' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: '#CFC8FA' }}>{KIND_LABEL[r.kind as ReviewKind]}</div>
        <h1 className="text-[24px] md:text-[30px] font-bold leading-tight mt-1">{r.label}</h1>
        <div className="text-[13px] mt-1" style={{ color: '#E4DEFF' }}>{r.start} → {r.end} · made {new Date(r.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{r.mix.profile ? ` · ${r.mix.profile} profile` : ''}</div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {[`${r.holdings.length} holdings`, `${(r.counts.switch ?? 0) + (r.counts.trim ?? 0) + (r.counts.check ?? 0)} to act on`, `${r.actions.length} actions`].map(t => <span key={t} className="rounded-full px-[11px] py-1 text-[11.5px] font-semibold" style={{ background: 'rgba(255,255,255,.16)' }}>{t}</span>)}
        </div>
      </section>

      <KpiGrid>
        <KpiTile label="Net worth" value={inr(r.totals.netWorth)} tint={0} icon={Landmark}
          delta={r.change?.netWorthBefore != null ? `${r.totals.netWorth >= r.change.netWorthBefore ? '▲' : '▼'} ${inr(Math.abs(r.totals.netWorth - r.change.netWorthBefore))} since ${r.change.since}` : 'Change shows from the next review'} tone={r.change?.netWorthBefore != null ? (r.totals.netWorth >= r.change.netWorthBefore ? 'good' : 'bad') : 'neutral'} />
        <KpiTile label="Invested" value={inr(r.totals.invested)} tint={1} icon={Wallet} delta={`${pctTxt(r.totals.gainPct)} on ${inr(r.totals.cost)} put in`} tone={(r.totals.gainPct ?? 0) >= 0 ? 'good' : 'bad'} />
        <KpiTile label="Growth this period" value={r.change?.growth != null ? `${r.change.growth >= 0 ? '+' : '−'}${inr(Math.abs(r.change.growth))}` : '—'} tint={3} icon={TrendingUp}
          delta={r.change?.growth != null ? `${pctTxt(r.change.growthPct)} · after ${inr(r.change.contributions)} put in` : 'Needs an earlier review'} tone={r.change?.growth != null ? (r.change.growth >= 0 ? 'good' : 'bad') : 'neutral'} />
        <KpiTile label="Actions" value={String(r.actions.length)} tint={2} icon={ListChecks} delta="Below, most important first" />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="What to do">
            {r.actions.length ? (
              <ol className="mt-2 flex flex-col gap-2">{r.actions.map((a, i) => (
                <li key={i}><Link href={a.href} className="flex gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{i + 1}</span>
                  <span className="text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>{a.text}</span></Link></li>))}</ol>
            ) : <p className="text-[12.5px] mt-2" style={{ color: 'var(--pos-text)' }}>✓ Nothing needs doing — keep your SIPs running.</p>}
          </Panel>

          {r.deep.length > 0 && (
            <Panel title={r.kind === 'year' ? 'Rebalancing & tax' : 'Rebalancing'}>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug" style={{ color: 'var(--text2)' }}>{r.deep.map((x, i) => <li key={i}>• {x}</li>)}</ul>
            </Panel>
          )}

          <section className="wl-card px-4 md:px-5 py-4">
            <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Every holding</h2>
            <ul className="mt-2">
              {r.holdings.map(h => {
                const v = VERDICT[h.verdict as Verdict]
                return (
                  <li key={h.key} className="py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                    <div className="flex items-center gap-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{h.name}</span>
                        <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>{h.sub}{h.r3y != null ? ` · 3y ${pctTxt(h.r3y)}/yr` : h.r1y != null ? ` · 1y ${pctTxt(h.r1y)}` : ''}{h.bench && h.benchR != null ? ` (${h.bench} ${pctTxt(h.benchR)})` : ''}</span>
                      </span>
                      <span className="text-right flex-shrink-0"><span className="block text-[13px] font-bold tabular-nums">{fmtCompact(h.value, h.currency === 'AED' ? 'AED' : 'INR')}</span>
                        {h.gainPct != null && <span className="block text-[11px] tabular-nums" style={{ color: h.gainPct >= 0 ? 'var(--pos-text)' : '#DC2626' }}>{pctTxt(h.gainPct)}</span>}</span>
                      <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold flex-shrink-0" style={{ background: v.bg, color: v.c }}>{v.label}</span>
                    </div>
                    {h.verdict !== 'keep' && <div className="text-[12px] mt-1 leading-snug" style={{ color: 'var(--text3)' }}>{h.action ?? h.reasons[0]}</div>}
                  </li>
                )
              })}
            </ul>
          </section>

          {r.adds.length > 0 && (
            <Panel title="What to add">
              <p className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>{EXAMPLE_NOTE}</p>
              <ul className="mt-2 flex flex-col gap-2.5">{r.adds.map(a => (
                <li key={a.id} className="rounded-xl px-3 py-2.5" style={{ border: '1px solid var(--line)' }}>
                  <div className="flex justify-between gap-3"><span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{a.title}</span><span className="text-[13px] font-bold tabular-nums">{fmtMoney(a.amount, a.currency)}</span></div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>{a.how}</div>
                  {a.examples.length > 0 && <div className="text-[11.5px] mt-1" style={{ color: 'var(--text2)' }}>e.g. {a.examples.slice(0, 3).map(e => e.name).join(' · ')}</div>}
                </li>))}</ul>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4">
          <Panel title={<span className="flex items-center gap-1.5"><Sparkles size={15} style={{ color: 'var(--accent)' }} />Market view</span>}>
            {mv ? (<>
              <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text2)' }}>{mv.summary}</p>
              <ul className="mt-2 flex flex-col gap-1.5">{mv.points.map((x, i) => <li key={i} className="text-[12px] leading-snug" style={{ color: 'var(--text2)' }}><b style={{ color: 'var(--text)' }}>{x.title}.</b> {x.detail}</li>)}</ul>
              {mv.sources.length > 0 && <div className="mt-2 text-[11px]" style={{ color: 'var(--text4)' }}>Sources: {mv.sources.slice(0, 6).map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer noopener" className="underline mr-2">{s.title}</a>)}</div>}
              <p className="text-[11px] mt-1.5" style={{ color: 'var(--text4)' }}>AI summary of news as of {mv.asOf}. Markets change — not advice.</p>
            </>) : aiReady ? (<>
              <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Ask AI to read today’s market news (interest rates, valuations, the rupee) and check these suggestions against it, with sources.</p>
              <button onClick={marketView} disabled={busy} className="wl-btn wl-btn-primary mt-2.5 disabled:opacity-60" style={{ height: 36 }}><Globe2 size={14} />{busy ? 'Reading the news…' : 'Add a market view'}</button>
            </>) : <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Add a real ANTHROPIC_API_KEY to .env.local and restart, and each review can include an AI market view of today’s news, with sources. The rules above work without it.</p>}
            {error && <p className="text-[12px] mt-2" style={{ color: '#B4231A' }}>{error}</p>}
          </Panel>

          <Panel title="Mix vs target">
            <ul className="mt-2.5 flex flex-col gap-2.5">{(['equity', 'debt', 'gold', 'cash'] as Cls[]).map(c => (
              <li key={c}><div className="flex justify-between text-[12.5px]"><span style={{ color: 'var(--text2)' }}>{CLS_LABEL[c]}</span><span className="tabular-nums"><b>{Math.round(r.mix.now[c])}%</b> <span style={{ color: 'var(--text4)' }}>/ {r.mix.target[c]}%</span></span></div>
                <div className="relative h-2 rounded-full mt-1" style={{ background: 'var(--track)' }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.mix.now[c])}%`, background: CLS_COLOR[c] }} />
                  <span aria-hidden className="absolute -top-1 w-[2px] h-4 rounded" style={{ left: `${r.mix.target[c]}%`, background: 'var(--text)' }} /></div></li>))}</ul>
          </Panel>

          <Panel title="Reach & currency">
            <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">{(Object.keys(ACCESS) as Access[]).map(k => (
              <li key={k} className="flex justify-between"><span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: ACCESS[k].color }} />{ACCESS[k].label}</span><span className="tabular-nums font-semibold">{inr(r.access[k] ?? 0)}</span></li>))}</ul>
            <p className="text-[12px] mt-2" style={{ color: 'var(--text3)' }}>{Math.round(r.currency.aedPct)}% in dirhams, {Math.round(r.currency.inrPct)}% in rupees.</p>
          </Panel>

          <Panel title="Protection">
            <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]" style={{ color: 'var(--text2)' }}>
              <li>Life cover: {r.protection.dependents === 0 ? 'no one depends on your income' : r.protection.gap > 0 ? <b style={{ color: 'var(--amber-text)' }}>{inr(r.protection.gap)} short</b> : <b style={{ color: 'var(--pos-text)' }}>enough ({inr(r.protection.cover)})</b>}</li>
              <li>Health cover: {r.protection.health > 0 ? inr(r.protection.health) : 'none recorded'}</li>
              {r.protection.nomineesMissing != null && <li>Nominees: {r.protection.nomineesMissing ? <b style={{ color: 'var(--amber-text)' }}>{r.protection.nomineesMissing} missing</b> : '✓ all recorded'}</li>}
            </ul>
          </Panel>

          <Panel title="How this was worked out">
            <ul className="mt-2 flex flex-col gap-1 text-[11.5px] leading-snug" style={{ color: 'var(--text3)' }}>{r.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
