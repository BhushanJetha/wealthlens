import { createClient } from '@/lib/supabase/server'
import { loadEventsData } from '@/lib/eventsData'
import EventsClient from '@/components/dashboard/EventsClient'

// Events & trips: trips, functions and festivals with their own budgets (migration 034)
export default async function EventsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return <EventsClient data={await loadEventsData(supabase, user!.id)} />
}
