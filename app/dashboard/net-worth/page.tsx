import { createClient, getSessionUser } from '@/lib/supabase/server'
import WealthOverviewClient from '@/components/dashboard/wealth/WealthOverviewClient'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { buildPortfolio } from '@/lib/portfolio/build'
import { ACCESS, byAccess, mixNow, toInr, type Access } from '@/lib/portfolio/holdings'

// Wealth overview: every holding (the same as Home), what needs you, your mix
// against its target, how quickly money can be reached, the AED / ₹ split
// and whether it's protected — from the shared portfolio engine. The history
// comes from Home's trends (/api/home/trends).
export default async function NetWorthPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const d = await loadPortfolioData(supabase, user!.id)
  const p = buildPortfolio(d)
  // The overview for both countries, and for each on its own: a country view
  // shows only that country's holdings, policies, nominees and to-dos
  const target = p.target.mix
  const overviewFor = (cur: 'AED' | 'INR' | null) => {
    const hs = cur ? p.hs.filter(h => h.currency === cur) : p.hs
    const access = cur ? byAccess(hs, d.fx) : p.access
    const mix = cur ? mixNow(hs, d.fx) : p.add.mix
    const ins = cur ? d.insurance.filter((x: any) => (x.currency === 'AED' ? 'AED' : 'INR') === cur) : d.insurance
    const lic = (d.holdings.lic ?? []).filter((x: any) => !cur || (x.currency === 'AED' ? 'AED' : 'INR') === cur)
    const inr = (v: any, c: any) => toInr(Number(v) || 0, c === 'AED' ? 'AED' : 'INR', d.fx)
    const healthPol = ins.filter((x: any) => x.policy_type === 'health')
    const nomRows = p.nominees.rows.filter(r => !cur || (r.currency === 'AED' ? 'AED' : 'INR') === cur)
    return {
      needs: p.needs.filter(n => !cur || !n.currency || n.currency === cur).slice(0, 8),
      access: (Object.keys(ACCESS) as Access[]).map(k => ({ key: k, ...ACCESS[k], value: access[k].value, count: access[k].items.length,
        top: [...access[k].items].sort((x, y) => toInr(y.value, y.currency, d.fx) - toInr(x.value, x.currency, d.fx)).slice(0, 3).map(x => x.name) })),
      currency: p.currency, returnPlan: (p.answers?.return as string | undefined) ?? null,
      // Life cover is for the family as a whole: whether it's enough is said in the All view only
      protection: cur
        ? { gap: 0, need: 0, dependents: p.protection.dependents, partial: true,
            cover: ins.filter((x: any) => x.policy_type === 'term_life').reduce((s2: number, x: any) => s2 + inr(x.sum_assured, x.currency), 0) + lic.reduce((s2: number, x: any) => s2 + inr(x.sum_assured, x.currency), 0),
            health: { amount: healthPol.reduce((s2: number, x: any) => s2 + inr(x.sum_assured, x.currency), 0), count: healthPol.length } }
        : { gap: p.protection.gap, cover: p.protection.cover, need: p.protection.need, dependents: p.protection.dependents, health: p.protection.health, partial: false },
      nominees: { missing: nomRows.filter(r => !r.nominee).length, total: nomRows.length, ready: p.nominees.ready },
      keepInr: cur ? 0 : p.add.keep,
      drift: (['equity', 'debt', 'gold', 'cash'] as const).map(c => ({ cls: c, now: mix.pct[c], target: target[c], off: mix.pct[c] - target[c] })),
      mixTotal: mix.total, targetSource: p.target.source,
      essentials: p.essentials, policies: ins.length + lic.length,
    }
  }
  const overview = overviewFor(null)
  const byCountry = { AED: overviewFor('AED'), INR: overviewFor('INR') }

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
      byCountry={byCountry}
    />
  )
}
