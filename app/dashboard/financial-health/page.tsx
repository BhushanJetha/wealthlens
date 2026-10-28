import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { activeLoansWithEmi } from '@/lib/loans'
import FinancialHealthClient from '@/components/dashboard/FinancialHealthClient'
import FinancialHealthTabs from '@/components/dashboard/FinancialHealthTabs'
import FreedomCheckClient from '@/components/dashboard/FreedomCheckClient'
import { detect } from '@/lib/freedom'
import { isMissingTable } from '@/lib/supabase/missingTable'

export default async function FinancialHealthPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id

  // 6 complete months of income / spending for the Freedom Check averages
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const fromDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`

  const [
    stocksRes, mfRes, fdRes, rdRes, npsRes, licRes,
    goldRes, bondRes, etfRes, loansRes, txnsRes, goalsRes, giRes,
    accountsRes, insuranceRes, ppfRes, recentRes, profileRes,
  ] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', uid),
    supabase.from('mutual_funds').select('*').eq('user_id', uid),
    supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('nps_accounts').select('*').eq('user_id', uid),
    supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('gold_investments').select('*').eq('user_id', uid),
    supabase.from('bond_investments').select('*').eq('user_id', uid),
    supabase.from('etf_investments').select('*').eq('user_id', uid),
    activeLoansWithEmi(supabase, uid),
    supabase.from('transactions').select('txn_type,amount,currency,txn_date').eq('user_id', uid)
      .eq('txn_type', 'income').order('txn_date', { ascending: false }).limit(200),
    supabase.from('goals').select('id,name,target_amount,currency').eq('user_id', uid).eq('status', 'active'),
    supabase.from('goal_investments').select('investment_type,investment_id').eq('user_id', uid),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    supabase.from('insurance_policies').select('policy_type,sum_assured,currency,expiry_date,is_active').eq('user_id', uid).eq('is_active', true),
    supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    fetchAll((a, b) => supabase.from('transactions').select('txn_type,amount,currency,txn_date,category,sub_category').eq('user_id', uid)
      .in('txn_type', ['income', 'expense', 'transfer']).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('financial_profile').select('answers,updated_at').eq('user_id', uid).maybeSingle(),
  ])

  const detected = detect({
    accounts: accountsRes.data ?? [], loans: loansRes.data ?? [], insurance: insuranceRes.data ?? [],
    nps: npsRes.data ?? [], ppfEpf: ppfRes.data ?? [], fds: fdRes.data ?? [], rds: rdRes.data ?? [],
    stocks: stocksRes.data ?? [], mfs: mfRes.data ?? [], etf: etfRes.data ?? [], gold: goldRes.data ?? [],
    bonds: bondRes.data ?? [], txns: recentRes.data ?? [], goals: goalsRes.data ?? [],
  })

  return (
    <FinancialHealthTabs
      check={
        <FreedomCheckClient
          detected={detected}
          initialAnswers={profileRes.data?.answers ?? null}
          updatedAt={profileRes.data?.updated_at ?? null}
          tableMissing={isMissingTable(profileRes.error)}
        />
      }
      score={
        <FinancialHealthClient
          stocks={stocksRes.data ?? []}
          mutualFunds={mfRes.data ?? []}
          fixedDeposits={fdRes.data ?? []}
          recurringDeposits={rdRes.data ?? []}
          npsAccounts={npsRes.data ?? []}
          licPolicies={licRes.data ?? []}
          goldInvestments={goldRes.data ?? []}
          bondInvestments={bondRes.data ?? []}
          etfInvestments={etfRes.data ?? []}
          loans={loansRes.data ?? []}
          transactions={txnsRes.data ?? []}
          goals={goalsRes.data ?? []}
          goalInvestments={giRes.data ?? []}
        />
      }
    />
  )
}
