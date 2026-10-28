import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { getAedInr } from '@/lib/fx'
import { loadRules } from '@/lib/rules'
import ReviewClient from '@/components/dashboard/ReviewClient'

// Review inbox: transactions to check, fixed in a tap, plus your rules.
export default async function ReviewPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  // 13 months: the inbox covers 90 days, the rest teaches the suggestions
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, accsRes, rules, fx] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('accounts').select('id,name,bank_name,account_type,currency,is_active').eq('user_id', uid),
    loadRules(supabase, uid),
    getAedInr(),
  ])

  return <ReviewClient today={today} fx={fx.rate} transactions={txns} accounts={accsRes.data ?? []} rules={rules} />
}
