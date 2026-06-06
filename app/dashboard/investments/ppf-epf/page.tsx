import { createClient } from '@/lib/supabase/server'
import PpfEpfClient from '@/components/dashboard/PpfEpfClient'

export default async function PpfEpfPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Defensive: if migration 017 hasn't been run yet the table won't exist.
  // Swallow the error and render an empty list rather than crashing the page.
  let data: any[] = []
  try {
    const res = await supabase
      .from('ppf_epf_accounts')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    data = res.data ?? []
  } catch {
    data = []
  }

  return <PpfEpfClient data={data ?? []} />
}
