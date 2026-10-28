import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { portfolioHoldings } from '@/lib/portfolio/holdings'
import { portfolioPerf } from '@/lib/portfolio/perf'
import { buildPortfolio } from '@/lib/portfolio/build'
import { buildReview, lastPeriod, nowPeriod } from '@/lib/portfolio/review'
import { NW_RULES } from '@/lib/netWorth'

// Make a portfolio review. { kind: 'auto' } (the bell, on any page): the last
// finished quarter / half-year / year, once — nothing if it exists or there
// are no investments. { kind: 'now' }: one right away, covering the time since
// the last review.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const auto = body?.kind !== 'now'

  const d = await loadPortfolioData(supabase, user.id)
  if (!d.reviewsReady) return NextResponse.json({ error: 'Run migration 032 in Supabase to get portfolio reviews.' }, { status: 400 })
  const period = auto ? lastPeriod(d.today) : nowPeriod(d.today, d.reviews[0]?.period_end)
  if (auto) {
    const have = d.reviews.find(r => r.kind === period.kind && r.period_end === period.end)
    if (have) return NextResponse.json({ id: have.id, existed: true })
  }
  const hs = portfolioHoldings(d.holdings, d.links, d.today)
  if (!hs.some(h => h.investable && h.type !== 'bank')) return NextResponse.json({ skipped: true, error: 'Add some investments first.' }, { status: auto ? 200 : 400 })

  const perf = await portfolioPerf(hs)
  const p = buildPortfolio(d, perf)
  // The last review before this period, for "what changed"
  const prev = (auto ? d.reviews.filter(r => r.period_end < period.end) : d.reviews)[0] ?? null
  const since = prev?.period_end ?? period.start
  const [snap, inv] = await Promise.all([
    supabase.from('net_worth_snapshots').select('snap_date,fx,uae_assets,uae_liab,india_assets,india_liab,breakdown').eq('user_id', user.id).lte('snap_date', period.start).order('snap_date', { ascending: false }).limit(5),
    supabase.from('investment_transactions').select('txn_type,amount,txn_date').eq('user_id', user.id).gt('txn_date', since).lte('txn_date', period.end),
  ])
  const s = (snap.data ?? []).find((x: any) => (x.breakdown?.rules ?? 1) >= NW_RULES)
  const snapAtStart = s ? { date: s.snap_date, value: (Number(s.india_assets) - Number(s.india_liab)) + (Number(s.uae_assets) - Number(s.uae_liab)) * Number(s.fx) } : null
  const IN = ['purchase', 'sip', 'switch_in'], OUT = ['redemption', 'switch_out']
  const contributions = (inv.data ?? []).reduce((t: number, x: any) => t + (IN.includes(x.txn_type) ? Number(x.amount) || 0 : OUT.includes(x.txn_type) ? -(Number(x.amount) || 0) : 0), 0)

  const data = buildReview(d, p, period, { prev, snapAtStart, contributions })
  const row = { user_id: user.id, kind: period.kind, label: period.label, period_start: period.start, period_end: period.end, data }
  const ins = await supabase.from('portfolio_reviews').insert(row).select('id').single()
  if (ins.error) {
    // Made a moment ago by another tab — hand back that one
    if (ins.error.code === '23505') {
      const ex = await supabase.from('portfolio_reviews').select('id').eq('user_id', user.id).eq('kind', period.kind).eq('period_end', period.end).maybeSingle()
      if (ex.data) return NextResponse.json({ id: ex.data.id, existed: true })
    }
    return NextResponse.json({ error: ins.error.message }, { status: 500 })
  }
  return NextResponse.json({ id: ins.data.id, label: period.label })
}
