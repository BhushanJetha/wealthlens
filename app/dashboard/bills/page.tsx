import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeLoansWithEmi } from '@/lib/loans'
import BillsClient from '@/components/dashboard/BillsClient'

export default async function BillsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // This month + the 4 complete months the recurring rule looks at
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 5)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, accsRes, loansRes, insRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).eq('txn_type', 'expense').gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true).eq('account_type', 'credit_card'),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
  ])

  return <BillsClient transactions={txns} cards={accsRes.data ?? []} loans={loansRes.data ?? []} insurance={insRes.data ?? []} />
}
