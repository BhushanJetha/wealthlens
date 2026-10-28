import { createClient, getSessionUser } from '@/lib/supabase/server'
import StocksDashboardClient from '@/components/dashboard/StocksDashboardClient'

export default async function StocksDashboardPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) return null
  const { data: stocks } = await supabase
    .from('stocks')
    .select('*')
    .eq('user_id', user.id)
    .order('avg_buy_price', { ascending: false })
  return <StocksDashboardClient stocks={stocks ?? []} />
}
