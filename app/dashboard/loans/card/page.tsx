import { createClient } from '@/lib/supabase/server'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function CardLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true).eq('loan_type', 'loan_on_card')
  return <LoanCategoryClient loans={data ?? []} title="Loan on Card" loanType="loan_on_card" />
}
