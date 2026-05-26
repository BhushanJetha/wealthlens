import { createClient } from '@/lib/supabase/server'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function OtherLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true).eq('loan_type', 'other_loan')
  return <LoanCategoryClient loans={data ?? []} title="Other Loans" loanType="other_loan" />
}
