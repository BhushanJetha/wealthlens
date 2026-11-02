import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { isMissingTable } from '@/lib/supabase/missingTable'
import IncomePlansClient from '@/components/dashboard/IncomePlansClient'

// Settings › Expected income: what you expect each month, and what you send on
export default async function IncomePlansPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 4)
  const [plans, accs, txns] = await Promise.all([
    supabase.from('income_plans').select('*').eq('user_id', uid).order('created_at'),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    fetchAllRows((a, b) => supabase.from('transactions').select('*').eq('user_id', uid).gte('txn_date', `${start.toISOString().slice(0, 7)}-01`).order('txn_date', { ascending: false }).order('id').range(a, b)),
  ])
  return <IncomePlansClient ready={!isMissingTable(plans.error)} today={today} plans={plans.data ?? []} accounts={accs.data ?? []} txns={txns} />
}
