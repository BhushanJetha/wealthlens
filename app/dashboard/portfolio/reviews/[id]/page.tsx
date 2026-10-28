import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { aiConfigured } from '@/lib/ai/claude'
import ReviewReport from '@/components/dashboard/PortfolioReviewReport'

// One portfolio review, as saved when it was made; opening it marks it read
export default async function ReviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: r } = await supabase.from('portfolio_reviews').select('*').eq('user_id', user!.id).eq('id', params.id).maybeSingle()
  if (!r) notFound()
  if (!r.seen_at) await supabase.from('portfolio_reviews').update({ seen_at: new Date().toISOString() }).eq('id', r.id)
  return <ReviewReport review={r} aiReady={aiConfigured()} />
}
