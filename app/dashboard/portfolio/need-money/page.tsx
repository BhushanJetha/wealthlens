import { createClient } from '@/lib/supabase/server'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { portfolioHoldings } from '@/lib/portfolio/holdings'
import { buildPortfolio } from '@/lib/portfolio/build'
import NeedMoneyClient from '@/components/dashboard/NeedMoneyClient'

// "I need money": where to take it from, cheapest first (lib/portfolio/withdraw)
export default async function NeedMoneyPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const d = await loadPortfolioData(supabase, user!.id)
  const hs = portfolioHoldings(d.holdings, d.links, d.today)
  // What a portfolio manager would sell first: holdings flagged to switch or trim, classes over target
  const p = buildPortfolio(d)
  const flagged = p.reviews.filter(r => r.verdict === 'switch' || r.verdict === 'trim').map(r => r.h.key)
  const overweight = p.drift.filter(x => x.off >= 7).map(x => x.cls), underweight = p.drift.filter(x => x.off <= -7).map(x => x.cls)
  return <NeedMoneyClient today={d.today} fx={d.fx} hs={JSON.parse(JSON.stringify(hs))} goals={d.goals.map(g => ({ id: g.id, name: g.name }))}
    essentials={{ AED: d.monthly.AED.essentials, INR: d.monthly.INR.essentials }} saving={{ AED: Math.max(0, d.monthly.AED.saved), INR: Math.max(0, d.monthly.INR.saved) }}
    flagged={flagged} overweight={overweight} underweight={underweight} />
}
