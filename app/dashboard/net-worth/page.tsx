import { createClient } from '@/lib/supabase/server'
import NetWorthClient from '@/components/dashboard/NetWorthClient'
import { loadPortfolioData } from '@/lib/portfolio/data'
import { buildPortfolio } from '@/lib/portfolio/build'
import { ACCESS, type Access } from '@/lib/portfolio/holdings'

// Wealth overview: net worth (same holdings and history as Home) plus what
// needs you, how quickly your money can be reached, the AED / ₹ split and
// whether it's protected — from the shared portfolio engine.
export default async function NetWorthPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const histFrom = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)

  const [d, hist] = await Promise.all([
    loadPortfolioData(supabase, uid, { txMonths: 13 }),
    supabase.from('net_worth_snapshots').select('snap_date,fx,uae_assets,uae_liab,india_assets,india_liab,breakdown')
      .eq('user_id', uid).gte('snap_date', histFrom).order('snap_date', { ascending: true }),
  ])
  const p = buildPortfolio(d)
  const overview = {
    needs: p.needs.slice(0, 8),
    access: (Object.keys(ACCESS) as Access[]).map(k => ({ key: k, ...ACCESS[k], value: p.access[k].value, count: p.access[k].items.length,
      top: p.access[k].items.sort((a, b) => (b.currency === 'AED' ? b.value * d.fx : b.value) - (a.currency === 'AED' ? a.value * d.fx : a.value)).slice(0, 3).map(x => x.name) })),
    currency: p.currency, returnPlan: (p.answers?.return as string | undefined) ?? null,
    protection: { gap: p.protection.gap, cover: p.protection.cover, need: p.protection.need, dependents: p.protection.dependents, health: p.protection.health },
    nominees: { missing: p.nominees.missing, total: p.nominees.rows.length, ready: p.nominees.ready },
    keepInr: p.add.keep,
  }

  return (
    <NetWorthClient
      today={d.today}
      failed={d.failed}
      {...d.holdings}
      transactions={d.transactions}
      snapshots={hist.data ?? []}
      otherAssets={d.holdings.otherAssets ?? []}
      gratuity={d.holdings.gratuity}
      overview={overview}
    />
  )
}
