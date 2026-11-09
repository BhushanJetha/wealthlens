import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import CategoriesClient from '@/components/dashboard/CategoriesClient'

// Settings › Categories: every category and its sub-categories, with this
// year's spending in each
export default async function CategoriesPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const year = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }).slice(0, 4)
  const txns = await fetchAllRows((a, b) => supabase.from('transactions').select('id,category,sub_category,txn_type,amount,friend_share,currency,merchant,description,paid_by_friend_id')
    .eq('user_id', user!.id).gte('txn_date', `${year}-01-01`).order('txn_date', { ascending: false }).order('id').range(a, b))
  return <CategoriesClient txns={txns} year={year} />
}
