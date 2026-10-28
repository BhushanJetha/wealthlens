import { createClient, getSessionUser } from '@/lib/supabase/server'
import NewsClient from '@/components/dashboard/NewsClient'

export default async function NewsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const [mfs, stocks, etfs] = await Promise.all([
    supabase.from('mutual_funds').select('fund_name').eq('user_id', uid),
    supabase.from('stocks').select('name,symbol').eq('user_id', uid),
    supabase.from('etf_investments').select('etf_name').eq('user_id', uid),
  ])
  // Holding names become match terms ("Affects · …"); stock symbols feed the movers list
  const holdings = [
    ...(mfs.data ?? []).map(m => ({ name: String(m.fund_name ?? ''), kind: 'mf' as const })),
    ...(stocks.data ?? []).map(s => ({ name: String(s.name || s.symbol || ''), symbol: s.symbol ? String(s.symbol) : undefined, kind: 'stock' as const })),
    ...(etfs.data ?? []).map(e => ({ name: String(e.etf_name ?? ''), kind: 'etf' as const })),
  ].filter(h => h.name)
  return <NewsClient holdings={holdings} />
}
