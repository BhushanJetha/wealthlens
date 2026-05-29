import { createClient } from '@/lib/supabase/server'
import GoalDetailClient from '@/components/dashboard/GoalDetailClient'
import { notFound } from 'next/navigation'

export default async function GoalDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [goalRes, giRes] = await Promise.all([
    supabase.from('goals').select('*').eq('id', params.id).eq('user_id', user!.id).single(),
    supabase.from('goal_investments').select('*').eq('goal_id', params.id).eq('user_id', user!.id),
  ])

  if (!goalRes.data) return notFound()
  const goal = goalRes.data
  const goalInvestments = giRes.data ?? []

  // Group linked investment IDs by type
  const byType: Record<string, string[]> = {}
  goalInvestments.forEach(gi => {
    if (!byType[gi.investment_type]) byType[gi.investment_type] = []
    byType[gi.investment_type].push(gi.investment_id)
  })

  // Fetch actual records for linked investments
  const typeResults = await Promise.all(
    Object.entries(byType).map(([type, ids]) =>
      (supabase.from(type as any).select('*').in('id', ids) as any)
        .then((res: any) => ({ type, data: res.data ?? [] }))
    )
  )

  // Build allLinked array
  const allLinked: { gi: any; record: any }[] = []
  typeResults.forEach(({ type, data }) => {
    data.forEach((record: any) => {
      const gi = goalInvestments.find(g => g.investment_type === type && g.investment_id === record.id)
      if (gi) allLinked.push({ gi, record })
    })
  })

  // Fetch all investments for the link modal
  const [stocksRes, mfRes, fdRes, rdRes, npsRes, licRes, goldRes, bondRes, etfRes] = await Promise.all([
    supabase.from('stocks').select('id, name, symbol, quantity, avg_buy_price, current_price, currency').eq('user_id', user!.id),
    supabase.from('mutual_funds').select('id, fund_name, units, avg_nav, current_nav, currency').eq('user_id', user!.id),
    supabase.from('fixed_deposits').select('id, name, bank_name, principal, currency').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('id, name, bank_name, monthly_amount, start_date, created_at, currency').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('nps_accounts').select('id, name, corpus_amount, invested_amount, currency').eq('user_id', user!.id),
    supabase.from('lic_policies').select('id, name, total_paid, annual_premium, currency').eq('user_id', user!.id).eq('is_active', true),
    supabase.from('gold_investments').select('id, name, quantity_grams, current_price_per_gram, buy_price_per_gram, invested_amount, currency').eq('user_id', user!.id),
    supabase.from('bond_investments').select('id, name, invested_amount, currency').eq('user_id', user!.id),
    supabase.from('etf_investments').select('id, etf_name, units, avg_buy_price, current_price, invested_amount, currency').eq('user_id', user!.id),
  ])

  return (
    <GoalDetailClient
      goal={goal}
      linkedInvestments={allLinked}
      allInvestments={{
        stocks:             stocksRes.data ?? [],
        mutual_funds:       mfRes.data ?? [],
        fixed_deposits:     fdRes.data ?? [],
        recurring_deposits: rdRes.data ?? [],
        nps_accounts:       npsRes.data ?? [],
        lic_policies:       licRes.data ?? [],
        gold_investments:   goldRes.data ?? [],
        bond_investments:   bondRes.data ?? [],
        etf_investments:    etfRes.data ?? [],
      }}
    />
  )
}
