import { createClient, getSessionUser } from '@/lib/supabase/server'
import InspireClient from '@/components/dashboard/InspireClient'

export default async function InspirePage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  // vision_pins comes from migration 022 — the board still works without it
  const { data: pins } = await supabase.from('vision_pins').select('*')
    .eq('user_id', user!.id).order('created_at', { ascending: false })
  return <InspireClient pins={pins ?? []} />
}
