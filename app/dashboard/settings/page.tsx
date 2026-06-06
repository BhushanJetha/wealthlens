import { createClient } from '@/lib/supabase/server'
import SettingsClient from '@/components/dashboard/SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  return <SettingsClient profile={profile} userId={user!.id} />
}
