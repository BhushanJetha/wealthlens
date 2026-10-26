import { createClient } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function CardLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await activeLoansWithEmi(supabase, user!.id, q => q.eq('loan_type', 'loan_on_card'))
  return <LoanCategoryClient loans={data ?? []} title="Loan on Card" loanType="loan_on_card" />
}
