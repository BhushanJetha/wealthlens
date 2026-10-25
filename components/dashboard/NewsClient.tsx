'use client'
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { PageHeader } from '@/components/ui/kit'

interface Article { title: string; link: string; pubDate: string; source: string; topic: string; description: string }
interface Quote { symbol: string; label: string; price: number; change: number; changePct: number; currency: string }
interface Holding { name: string; symbol?: string; kind: 'mf' | 'stock' | 'etf' }

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My holdings' },
  { key: 'mf', label: 'Mutual funds' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'general', label: 'Economy' },
  { key: 'uae', label: 'UAE' },
] as const
type Chip = (typeof CHIPS)[number]['key']

function timeAgo(iso: string) {
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return ''
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000))
  return mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`
}
const fmtPrice = (q: Quote) => q.symbol === 'AEDINR=X' ? `₹${q.price.toFixed(2)}` : q.price.toLocaleString('en-IN', { maximumFractionDigits: q.price < 100 ? 2 : 0 })

// Market news (design v2): index ticker, topic chips, featured story + list
// tagged with the holding each headline touches, AI brief, holdings movers.
export default function NewsClient({ holdings }: { holdings: Holding[] }) {
  const { openAdvisor } = useUiStore()
  const [chip, setChip] = useState<Chip>('all')
  const [articles, setArticles] = useState<Article[] | null>(null)
  const [quotes, setQuotes] = useState<{ indices: Quote[]; holdings: Quote[] } | null>(null)
  const [nonce, setNonce] = useState(0)

  // Match terms: first two words of fund names, full stock names
  const terms = useMemo(() => Array.from(new Set(holdings.map(h =>
    h.kind === 'mf' ? h.name.split(' ').slice(0, 2).join(' ') : h.name).filter(t => t.length > 2))).slice(0, 20), [holdings])
  const symbols = useMemo(() => holdings.filter(h => h.symbol).map(h => h.symbol!).slice(0, 15), [holdings])

  useEffect(() => {
    let live = true
    setArticles(null)
    fetch(`/api/market-news?limit=30${terms.length ? `&terms=${encodeURIComponent(terms.join(','))}` : ''}`)
      .then(r => r.json()).then(d => { if (live) setArticles(d.articles ?? []) }).catch(() => { if (live) setArticles([]) })
    fetch(`/api/market-quotes${symbols.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : ''}`)
      .then(r => r.json()).then(d => { if (live) setQuotes({ indices: d.indices ?? [], holdings: d.holdings ?? [] }) }).catch(() => { if (live) setQuotes({ indices: [], holdings: [] }) })
    return () => { live = false }
  }, [terms, symbols, nonce])

  const affects = (a: Article) => {
    const hay = `${a.title} ${a.description}`.toLowerCase()
    return terms.find(t => hay.includes(t.toLowerCase()))
  }
  const shown = (articles ?? []).filter(a =>
    chip === 'all' ? true : chip === 'mine' ? !!affects(a) : a.topic === chip)
  const [featured, ...rest] = shown
  const movers = [...(quotes?.holdings ?? [])].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 6)

  const briefPrompt = `Give me a 90-word daily brief: what today's market headlines mean for my holdings, and whether anything needs action. `
    + `Indices: ${(quotes?.indices ?? []).map(q => `${q.label} ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`).join(', ') || 'unavailable'}. `
    + `My holdings include: ${holdings.slice(0, 15).map(h => h.name).join(', ') || 'none'}. `
    + `Headlines: ${(articles ?? []).slice(0, 10).map(a => a.title).join(' | ')}.`

  const tag = (t?: string) => t && (
    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>Affects · {t}</span>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Market news" sub="Headlines for India and the UAE, tagged with the holdings they touch"
        actions={<button onClick={() => setNonce(n => n + 1)} className="wl-btn" style={{ height: 34 }}><RefreshCw size={14} />Refresh</button>} />

      {/* Index ticker */}
      <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-5">
        {quotes === null
          ? [0, 1, 2, 3, 4].map(i => <div key={i} className="h-[68px] min-w-[120px] rounded-xl animate-pulse" style={{ background: '#E8EBF0' }} />)
          : quotes.indices.length === 0
            ? <div className="text-[12.5px] py-2 md:col-span-5" style={{ color: 'var(--text3)' }}>Market quotes are unavailable right now.</div>
            : quotes.indices.map(q => (
              <div key={q.symbol} className="wl-card flex-shrink-0 min-w-[120px] px-3.5 py-2.5 !rounded-xl">
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{q.label}</div>
                <div className="text-[14px] md:text-[15px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtPrice(q)}</div>
                <div className="text-[11px] font-semibold" style={{ color: q.change >= 0 ? '#16A34A' : '#DC2626' }}>
                  {q.change >= 0 ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%
                </div>
              </div>
            ))}
      </div>

      {/* Topic chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {CHIPS.map(c => (
          <button key={c.key} onClick={() => setChip(c.key)} aria-pressed={chip === c.key} className="wl-chip flex-shrink-0">{c.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-3 max-lg:order-2">
          {articles === null ? (
            [0, 1, 2, 3].map(i => <div key={i} className="h-[84px] rounded-xl animate-pulse" style={{ background: '#E8EBF0' }} />)
          ) : shown.length === 0 ? (
            <div className="wl-card px-5 py-10 text-center text-[13px]" style={{ color: 'var(--text3)' }}>
              {chip === 'mine' ? 'No headlines mention your holdings right now.' : 'No fresh headlines here right now.'}
            </div>
          ) : (<>
            {featured && (
              <a href={featured.link} target="_blank" rel="noopener noreferrer" className="wl-card block px-4 md:px-6 py-4 md:py-5 group">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--accent)' }}>Top story</div>
                <div className="text-[17px] md:text-[20px] font-bold leading-snug mt-1 group-hover:underline" style={{ color: 'var(--text)' }}>
                  {featured.title} <ExternalLink size={13} className="inline -mt-1 opacity-50" />
                </div>
                {featured.description && featured.description !== featured.title && (
                  <p className="text-[13px] leading-normal mt-1.5 line-clamp-2" style={{ color: 'var(--text3)' }}>{featured.description}</p>
                )}
                <div className="text-[11.5px] mt-2.5 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text4)' }}>
                  {featured.source} · {timeAgo(featured.pubDate)} {tag(affects(featured))}
                </div>
              </a>
            )}
            <div className="wl-card px-4 md:px-5 py-1.5">
              {rest.map((a, i) => (
                <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" className="block py-3 group" style={{ borderTop: i ? '1px solid #F1F5F9' : undefined }}>
                  <div className="text-[13.5px] md:text-[14px] font-semibold leading-snug group-hover:underline" style={{ color: 'var(--text)' }}>
                    {a.title} <ExternalLink size={11} className="inline -mt-0.5 opacity-50" />
                  </div>
                  <div className="text-[11.5px] mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text4)' }}>
                    {a.source} · {timeAgo(a.pubDate)} {tag(affects(a))}
                  </div>
                </a>
              ))}
            </div>
          </>)}
        </div>

        <div className="flex flex-col gap-3.5 max-lg:order-1">
          <section className="rounded-[18px] md:rounded-[20px] bg-review text-white px-4 md:px-5 py-4">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: '#DAD3FF' }}>✦ AI daily brief</div>
            <p className="text-[13px] leading-normal mt-1.5" style={{ color: '#E6E0FF' }}>
              A short read on today&apos;s headlines and what they mean for the funds and stocks you hold.
            </p>
            <button onClick={() => openAdvisor(briefPrompt)} disabled={articles === null}
              className="mt-3 rounded-full px-4 py-2 text-[12.5px] font-semibold disabled:opacity-60" style={{ background: '#fff', color: '#2E2470' }}>
              Get today&apos;s brief
            </button>
          </section>

          {movers.length > 0 && (
            <section className="wl-card px-4 md:px-5 py-3.5 md:py-4">
              <h2 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text)' }}>Your stocks today</h2>
              {movers.map(q => (
                <div key={q.symbol} className="flex justify-between items-center py-2" style={{ borderTop: '1px solid var(--track)' }}>
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{q.label}</span>
                  <span className="text-right">
                    <span className="block text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>{fmtPrice(q)}</span>
                    <span className="block text-[11.5px] font-semibold" style={{ color: q.change >= 0 ? '#16A34A' : '#DC2626' }}>{q.change >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%</span>
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
