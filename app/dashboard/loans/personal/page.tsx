import { createClient } from '@/lib/supabase/server'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function PersonalLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true).eq('loan_type', 'personal_loan')
  return <LoanCategoryClient loans={data ?? []} title="Personal Loans" loanType="personal_loan" />
}
