import { createClient, getSessionUser } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { lastPeriod } from '@/lib/portfolio/review'
import ReviewsClient from '@/components/dashboard/PortfolioReviewsClient'

// Portfolio reports: every quarterly, half-yearly, yearly and on-request review
export default async function ReviewsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data, error } = await supabase.from('portfolio_reviews').select('id,kind,label,period_start,period_end,created_at,seen_at,data->totals,data->counts,data->actions')
    .eq('user_id', user!.id).order('period_end', { ascending: false }).order('created_at', { ascending: false }).limit(40)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  return <ReviewsClient reviews={(data ?? []) as any[]} ready={!isMissingTable(error) && !error} next={lastPeriod(today)} />
}
