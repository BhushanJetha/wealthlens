import { createClient } from '@/lib/supabase/server'
import MarketLinkedClient from '@/components/dashboard/MarketLinkedClient'

export default async function MarketLinkedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [mfRes, stRes, etfRes] = await Promise.all([
    supabase.from('mutual_funds').select('*').eq('user_id', user.id),
    supabase.from('stocks').select('*').eq('user_id', user.id),
    supabase.from('etf_investments').select('*').eq('user_id', user.id),
  ])

  return (
    <MarketLinkedClient
      funds={mfRes.data ?? []}
      stocks={stRes.data ?? []}
      etfs={etfRes.data ?? []}
    />
  )
}
