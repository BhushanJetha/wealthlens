import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import MoneyFlowClient from '@/components/dashboard/MoneyFlowClient'
import { markUnitemisedCardBills } from '@/lib/money'

// Money flow: UAE earnings → sent to India → NRE → NRO → spent / invested.
export default async function MoneyFlowPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 13)
  const fromDate = `${from.toISOString().slice(0, 7)}-01`

  const [txns, accsRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('id,account_id,txn_date,merchant,description,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).gte('txn_date', fromDate).order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('accounts').select('id,name,bank_name,account_type,currency').eq('user_id', uid),
  ])
  const accounts = accsRes.data ?? []
  const cardIds = new Set(accounts.filter(a => a.account_type === 'credit_card').map(a => a.id))
  return <MoneyFlowClient transactions={markUnitemisedCardBills(txns, cardIds)} accounts={accounts} />
}
