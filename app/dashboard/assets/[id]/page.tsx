import { notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import PropertyClient from '@/components/dashboard/PropertyClient'

// One property (other_assets) with the loan that bought it: the loan's own
// records (releases, EMIs, prepayments, your down payments) and its payment
// plan are read here, never copied
export default async function PropertyPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) return null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const [assetRes, loansRes] = await Promise.all([
    supabase.from('other_assets').select('*').eq('id', params.id).eq('user_id', user.id).maybeSingle(),
    activeLoansWithEmi(supabase, user.id),
  ])
  const asset = assetRes.data
  if (!asset) return notFound()
  const loans = loansRes.data ?? []
  let loan = asset.loan_id ? loans.find((l: any) => l.id === asset.loan_id) ?? null : null
  // A closed loan still explains how the home was paid for
  if (asset.loan_id && !loan) loan = (await supabase.from('home_loans').select('*').eq('id', asset.loan_id).eq('user_id', user.id).maybeSingle()).data ?? null
  const [txns, plan] = loan ? await Promise.all([
    supabase.from('loan_transactions').select('*').eq('loan_id', loan.id).order('txn_date', { ascending: true }).then(({ data }: any) => data ?? [], () => []),
    supabase.from('loan_payment_plan').select('*').eq('loan_id', loan.id).order('slab_no', { ascending: true }).then(({ data }: any) => data ?? [], () => []),
  ]) : [[], []]
  return <PropertyClient asset={asset} loan={loan} txns={txns} plan={plan} loans={loans} today={today} />
}
