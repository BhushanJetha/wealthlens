import { notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadEventsData } from '@/lib/eventsData'
import EventDetailClient from '@/components/dashboard/EventDetailClient'

// One trip or event: its spending against its own budget
export default async function EventPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const data = await loadEventsData(supabase, user!.id)
  if (!data.events.some(e => e.id === params.id)) notFound()
  return <EventDetailClient id={params.id} data={data} />
}
