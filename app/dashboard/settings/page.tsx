import { createClient } from '@/lib/supabase/server'
import SettingsClient from '@/components/dashboard/SettingsClient'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <SettingsClient profile={profile} accounts={accounts ?? []} userId={user!.id} />
}
