import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const INV_TABLES: Record<string, string> = {
  mutual_fund:       'mutual_funds',
  stock:             'stocks',
  fixed_deposit:     'fixed_deposits',
  recurring_deposit: 'recurring_deposits',
  nps:               'nps_accounts',
  lic:               'lic_policies',
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim() })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function buildRow(type: string, row: Record<string, string>, userId: string): Record<string, any> {
  const cur = row.currency || 'INR'
  const base = { user_id: userId, currency: cur }
  const num = (k: string) => row[k] ? Number(row[k]) : null
  const str = (k: string) => row[k] || null

  switch (type) {
    case 'mutual_fund':
      return { ...base, fund_name: row.fund_name || row.name, fund_type: row.fund_type || 'equity', units: num('units'), nav: num('nav'), invested_amount: num('invested_amount') || num('amount'), current_value: num('current_value'), purchase_date: str('purchase_date') || str('date'), folio_number: str('folio_number') }
    case 'stock':
      return { ...base, stock_name: row.stock_name || row.name, ticker: row.ticker || row.symbol, quantity: num('quantity') || num('units'), avg_buy_price: num('avg_buy_price') || num('price'), current_price: num('current_price') || num('avg_buy_price') || num('price'), buy_date: str('buy_date') || str('date'), exchange: row.exchange || 'NSE' }
    case 'fixed_deposit':
      return { ...base, bank_name: row.bank_name || row.bank, principal_amount: num('principal_amount') || num('amount'), interest_rate: num('interest_rate') || num('rate'), start_date: str('start_date') || str('date'), maturity_date: str('maturity_date'), maturity_amount: num('maturity_amount') }
    case 'recurring_deposit':
      return { ...base, bank_name: row.bank_name || row.bank, monthly_amount: num('monthly_amount') || num('amount'), interest_rate: num('interest_rate') || num('rate'), start_date: str('start_date') || str('date'), end_date: str('end_date') || str('maturity_date'), total_invested: num('total_invested') || num('amount') }
    case 'nps':
      return { ...base, account_number: str('account_number') || str('pran'), pension_fund_manager: row.pension_fund_manager || row.pfm || row.name, tier: row.tier || 'tier1', total_corpus: num('total_corpus') || num('amount'), equity_pct: num('equity_pct') || 50, corporate_bond_pct: num('corporate_bond_pct') || 30, govt_bond_pct: num('govt_bond_pct') || 20 }
    case 'lic':
      return { ...base, policy_number: str('policy_number'), policy_name: row.policy_name || row.name, sum_assured: num('sum_assured'), annual_premium: num('annual_premium') || num('premium') || num('amount'), premium_frequency: row.premium_frequency || 'annual', start_date: str('start_date') || str('date'), maturity_date: str('maturity_date'), policy_type: row.policy_type || 'endowment' }
    default:
      return { ...base, name: row.name, amount: num('amount') }
  }
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const invType = (formData.get('investmentType') as string) ?? 'mutual_fund'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  try {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: 'No valid data found in file' }, { status: 400 })

    const table = INV_TABLES[invType]
    const savedItems: any[] = []
    const errors: string[] = []

    for (const row of rows) {
      try {
        const dbRow = buildRow(invType, row, user.id)
        const { data, error } = await supabase.from(table).insert(dbRow).select().single()
        if (error) errors.push(error.message)
        else if (data) savedItems.push(data)
      } catch (e: any) {
        errors.push(e.message)
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      imported: savedItems.length,
      errors: errors.length,
      items: savedItems,
      preview: rows.slice(0, 5),
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse file', details: err.message }, { status: 500 })
  }
}
