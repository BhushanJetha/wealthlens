import { createClient } from '@/lib/supabase/server'
import NetWorthClient from '@/components/dashboard/NetWorthClient'
import { isMissingTable } from '@/lib/supabase/missingTable'

export default async function NetWorthPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id

  // Same window and dates as Home, so both draw the same net-worth line
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 13)
  const fromDate = `${from.toISOString().slice(0, 7)}-01`
  const histFrom = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)

  const named = {
    'Bank accounts': supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    'Stocks': supabase.from('stocks').select('*').eq('user_id', uid),
    'Mutual funds': supabase.from('mutual_funds').select('*').eq('user_id', uid),
    'ETFs': supabase.from('etf_investments').select('*').eq('user_id', uid),
    'NPS': supabase.from('nps_accounts').select('*').eq('user_id', uid),
    'Fixed deposits': supabase.from('fixed_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    'Recurring deposits': supabase.from('recurring_deposits').select('*').eq('user_id', uid).eq('is_active', true),
    'PPF / EPF': supabase.from('ppf_epf_accounts').select('*').eq('user_id', uid),
    'Gold': supabase.from('gold_investments').select('*').eq('user_id', uid),
    'Bonds': supabase.from('bond_investments').select('*').eq('user_id', uid),
    'LIC': supabase.from('lic_policies').select('*').eq('user_id', uid).eq('is_active', true),
    'Loans': supabase.from('home_loans').select('*').eq('user_id', uid).eq('is_active', true),
    'Transactions': supabase.from('transactions').select('txn_type,amount,currency,txn_date,category,sub_category,merchant')
      .eq('user_id', uid).gte('txn_date', fromDate).order('txn_date', { ascending: true }).limit(5000),
    'History': supabase.from('net_worth_snapshots').select('snap_date,fx,uae_assets,uae_liab,india_assets,india_liab,breakdown')
      .eq('user_id', uid).gte('snap_date', histFrom).order('snap_date', { ascending: true }),
  }
  const keys = Object.keys(named) as (keyof typeof named)[]
  const res = await Promise.all(keys.map(k => named[k]))
  const data = Object.fromEntries(keys.map((k, i) => [k, res[i].data ?? []])) as Record<keyof typeof named, any[]>
  // A failed read would silently count as zero — say so on the page instead.
  // (Optional tables that haven't been created yet aren't failures.)
  const failed = keys.filter((k, i) => res[i].error && !isMissingTable(res[i].error))

  return (
    <NetWorthClient
      today={today}
      failed={failed}
      accounts={data['Bank accounts']}
      stocks={data['Stocks']}
      mutualFunds={data['Mutual funds']}
      etf={data['ETFs']}
      nps={data['NPS']}
      fixedDeposits={data['Fixed deposits']}
      recurringDeposits={data['Recurring deposits']}
      ppfEpf={data['PPF / EPF']}
      gold={data['Gold']}
      bonds={data['Bonds']}
      lic={data['LIC']}
      loans={data['Loans']}
      transactions={data['Transactions']}
      snapshots={data['History']}
    />
  )
}
