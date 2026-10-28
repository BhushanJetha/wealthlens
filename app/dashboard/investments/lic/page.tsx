import { createClient, getSessionUser } from '@/lib/supabase/server'
import LicClient from '@/components/dashboard/LicClient'

export default async function LicPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await supabase.from('lic_policies').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
  return <LicClient data={data ?? []} />
}
