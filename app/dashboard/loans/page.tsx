import { createClient } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoansClient from '@/components/dashboard/LoansClient'

export default async function LoansPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: loans } = await activeLoansWithEmi(supabase, user!.id)
  return <LoansClient loans={loans ?? []} />
}
