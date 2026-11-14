import { createClient, getSessionUser } from '@/lib/supabase/server'
import WealthOverviewClient from '@/components/dashboard/wealth/WealthOverviewClient'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { buildPortfolio } from '@/lib/portfolio/build'
import { ACCESS, type Access } from '@/lib/portfolio/holdings'

// Wealth overview: every holding (the same as Home), what needs you, your mix
// against its target, how quickly money can be reached, the AED / ₹ split
// and whether it's protected — from the shared portfolio engine. The history
// comes from Home's trends (/api/home/trends).
export default async function NetWorthPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const d = await loadPortfolioData(supabase, user!.id)
  const p = buildPortfolio(d)
  const overview = {
    needs: p.needs.slice(0, 8),
    access: (Object.keys(ACCESS) as Access[]).map(k => ({ key: k, ...ACCESS[k], value: p.access[k].value, count: p.access[k].items.length,
      top: p.access[k].items.sort((a, b) => (b.currency === 'AED' ? b.value * d.fx : b.value) - (a.currency === 'AED' ? a.value * d.fx : a.value)).slice(0, 3).map(x => x.name) })),
    currency: p.currency, returnPlan: (p.answers?.return as string | undefined) ?? null,
    protection: { gap: p.protection.gap, cover: p.protection.cover, need: p.protection.need, dependents: p.protection.dependents, health: p.protection.health },
    nominees: { missing: p.nominees.missing, total: p.nominees.rows.length, ready: p.nominees.ready },
    keepInr: p.add.keep,
    drift: p.drift, mixTotal: p.add.mix.total, targetSource: p.target.source,
    essentials: p.essentials, policies: d.insurance.length + (d.holdings.lic ?? []).length,
  }

  // Each account's latest entry, for how fresh the numbers are
  const lastEntry: Record<string, string> = {}
  for (const t of d.transactions) if (t.account_id && (!lastEntry[t.account_id] || t.txn_date > lastEntry[t.account_id])) lastEntry[t.account_id] = String(t.txn_date).slice(0, 10)

  return (
    <WealthOverviewClient
      lastEntry={lastEntry}
      today={d.today}
      failed={d.failed}
      {...d.holdings}
      otherAssets={d.holdings.otherAssets ?? []}
      gratuity={d.holdings.gratuity}
      overview={overview}
    />
  )
}
