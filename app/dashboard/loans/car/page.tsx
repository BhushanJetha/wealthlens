import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function CarLoanPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await activeLoansWithEmi(supabase, user!.id, q => q.in('loan_type', ['car_loan','bike_loan']))
  return <LoanCategoryClient loans={data ?? []} title="Car / Bike Loans" loanType="car_loan" />
}
