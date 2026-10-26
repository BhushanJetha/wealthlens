import { createClient } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function PersonalLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await activeLoansWithEmi(supabase, user!.id, q => q.eq('loan_type', 'personal_loan'))
  return <LoanCategoryClient loans={data ?? []} title="Personal Loans" loanType="personal_loan" />
}
