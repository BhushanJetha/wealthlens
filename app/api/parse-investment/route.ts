import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const INV_TABLES: Record<string, string> = {
  mutual_fund:        'mutual_funds',
  stock:              'stocks',
  fixed_deposit:      'fixed_deposits',
  recurring_deposit:  'recurring_deposits',
  nps:                'nps_accounts',
  lic:                'lic_policies',
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const invType = (formData.get('investmentType') as string) ?? 'mutual_fund'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    const prompt = `You are a financial data extraction expert. Analyze this ${invType} investment document and extract all investment details.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "investments": [
    {
      "name": "Fund/Stock/FD name",
      "type": "${invType}",
      "amount": 100000,
      "units": 1234.567,
      "nav": 45.23,
      "purchase_date": "YYYY-MM-DD",
      "maturity_date": "YYYY-MM-DD",
      "interest_rate": 7.5,
      "current_value": 120000,
      "folio_number": "optional",
      "currency": "INR",
      "notes": "any other relevant info"
    }
  ]
}

Rules:
- Extract ALL investment entries from the document
- Use null for missing optional fields
- Dates in YYYY-MM-DD format
- Positive numeric amounts only`

    const result = await model.generateContent([
      { inlineData: { mimeType: file.type as any, data: base64 } },
      prompt,
    ])

    const raw = result.response.text()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse response from AI')

    const parsed = JSON.parse(jsonMatch[0])
    const investments = parsed.investments ?? []

    // Save to appropriate table
    const table = INV_TABLES[invType]
    const savedItems: any[] = []

    if (table && investments.length > 0) {
      for (const inv of investments) {
        const row = buildRow(invType, inv, user.id)
        const { data } = await supabase.from(table).insert(row).select().single()
        if (data) savedItems.push(data)
      }
    }

    return NextResponse.json({
      success: true,
      count: savedItems.length,
      investments: savedItems,
      preview: investments.slice(0, 5),
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse investment document', details: err.message }, { status: 500 })
  }
}

function buildRow(type: string, inv: any, userId: string): Record<string, any> {
  const base = { user_id: userId, currency: inv.currency ?? 'INR', notes: inv.notes }
  switch (type) {
    case 'mutual_fund':
      return { ...base, fund_name: inv.name, fund_type: 'equity', units: inv.units, nav: inv.nav, invested_amount: inv.amount, current_value: inv.current_value, purchase_date: inv.purchase_date, folio_number: inv.folio_number }
    case 'stock':
      return { ...base, stock_name: inv.name, ticker: inv.folio_number, quantity: inv.units, avg_buy_price: inv.nav, current_price: inv.nav, buy_date: inv.purchase_date, exchange: 'NSE' }
    case 'fixed_deposit':
      return { ...base, bank_name: inv.name, principal_amount: inv.amount, interest_rate: inv.interest_rate, start_date: inv.purchase_date, maturity_date: inv.maturity_date, maturity_amount: inv.current_value }
    case 'recurring_deposit':
      return { ...base, bank_name: inv.name, monthly_amount: inv.amount, interest_rate: inv.interest_rate, start_date: inv.purchase_date, end_date: inv.maturity_date, total_invested: inv.amount }
    case 'nps':
      return { ...base, account_number: inv.folio_number, pension_fund_manager: inv.name, tier: 'tier1', total_corpus: inv.current_value, equity_pct: 50, corporate_bond_pct: 30, govt_bond_pct: 20 }
    case 'lic':
      return { ...base, policy_number: inv.folio_number, policy_name: inv.name, sum_assured: inv.current_value, annual_premium: inv.amount, premium_frequency: 'annual', start_date: inv.purchase_date, maturity_date: inv.maturity_date, policy_type: 'endowment' }
    default:
      return { ...base, name: inv.name, amount: inv.amount }
  }
}
