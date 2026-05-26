import { createClient } from '@/lib/supabase/server'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function GoldLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true).eq('loan_type', 'gold_loan')
  return <LoanCategoryClient loans={data ?? []} title="Gold Loans" loanType="gold_loan" />
}
