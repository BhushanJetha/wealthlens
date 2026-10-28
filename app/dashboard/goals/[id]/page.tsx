import { notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadGoalsData } from '@/lib/goalsData'
import GoalDetailClient from '@/components/dashboard/GoalDetailClient'

// One goal, computed with the same engine and data as the Goals list
export default async function GoalDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const data = await loadGoalsData(supabase, user!.id)
  if (!data.goals.some(g => g.id === params.id)) return notFound()
  return <GoalDetailClient goalId={params.id} data={data} />
}
