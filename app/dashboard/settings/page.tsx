import { createClient, getSessionUser } from '@/lib/supabase/server'
import SettingsClient from '@/components/dashboard/SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  return <SettingsClient profile={profile} userId={user!.id} />
}
