import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { portfolioHoldings } from '@/lib/portfolio/holdings'
import { portfolioPerf } from '@/lib/portfolio/perf'
import { buildPortfolio } from '@/lib/portfolio/build'
import PortfolioClient from '@/components/dashboard/PortfolioClient'

// Portfolio manager: every holding reviewed against live returns and your
// target mix, what to add, and what to do first
export default async function PortfolioPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const d = await loadPortfolioData(supabase, user!.id)
  const perf = await portfolioPerf(portfolioHoldings(d.holdings, d.links, d.today))
  const p = buildPortfolio(d, perf)
  return <PortfolioClient today={d.today} fx={d.fx} p={JSON.parse(JSON.stringify({ ...p, hs: [] }))} reviews={d.reviews.map(r => ({ id: r.id, label: r.label, kind: r.kind, period_end: r.period_end, seen_at: r.seen_at }))}
    reviewsReady={d.reviewsReady} wealthReady={d.wealthReady} perfCount={Object.keys(perf).length} />
}
