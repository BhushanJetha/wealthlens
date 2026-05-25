import { createClient } from '@/lib/supabase/server'
import InsuranceClient from '@/components/dashboard/InsuranceClient'

export default async function InsurancePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: policies } = await supabase.from('insurance_policies').select('*').eq('user_id', user!.id).order('next_premium_date', { ascending: true })
  return <InsuranceClient policies={policies ?? []} />
}
