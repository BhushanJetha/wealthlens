import { createClient } from '@/lib/supabase/server'
import GoalsClient from '@/components/dashboard/GoalsClient'

export default async function GoalsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [goalsRes, giRes, stocksRes, mfRes, fdRes, rdRes, npsRes, licRes, goldRes, bondRes, etfRes] = await Promise.all([
    supabase.from('goals').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
    supabase.from('goal_investments').select('*').eq('user_id', user!.id),
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
    <GoalsClient
      goals={goalsRes.data ?? []}
      goalInvestments={giRes.data ?? []}
      allInvestments={{
        stocks:              stocksRes.data ?? [],
        mutual_funds:        mfRes.data ?? [],
        fixed_deposits:      fdRes.data ?? [],
        recurring_deposits:  rdRes.data ?? [],
        nps_accounts:        npsRes.data ?? [],
        lic_policies:        licRes.data ?? [],
        gold_investments:    goldRes.data ?? [],
        bond_investments:    bondRes.data ?? [],
        etf_investments:     etfRes.data ?? [],
      }}
    />
  )
}
