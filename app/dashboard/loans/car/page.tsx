import { createClient } from '@/lib/supabase/server'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function CarLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data } = await supabase.from('home_loans').select('*').eq('user_id', user!.id).eq('is_active', true).in('loan_type', ['car_loan','bike_loan'])
  return <LoanCategoryClient loans={data ?? []} title="Car / Bike Loans" loanType="car_loan" />
}
