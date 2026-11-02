import { createClient, getRealSessionUser } from '@/lib/supabase/server'
import SettingsClient from '@/components/dashboard/SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  const user = await getRealSessionUser(supabase)
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  return <SettingsClient profile={profile} userId={user!.id} />
}
