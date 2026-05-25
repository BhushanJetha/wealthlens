import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  const fileType = formData.get('fileType') as string // 'bank_statement' | 'credit_card_statement'
  const bankHint = formData.get('bankHint') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = Buffer.from(bytes).toString('base64')
  const fileName = `${user.id}/${Date.now()}_${file.name}`

  const { data: storageData, error: storageErr } = await supabase.storage
    .from('statements')
    .upload(fileName, bytes, { contentType: file.type, upsert: false })

  if (storageErr) console.error('Storage upload error:', storageErr)

  // Create upload record
  const { data: uploadRecord } = await supabase.from('statement_uploads').insert({
    user_id: user.id,
    file_name: file.name,
    file_size: file.size,
    file_type: fileType,
    bank_name: bankHint,
    status: 'processing',
  }).select().single()

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    const prompt = `You are a financial data extraction expert. Analyze this bank/credit card statement and extract ALL transactions.
${bankHint ? `Bank: ${bankHint}` : ''}

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "bank_name": "detected bank name",
  "account_last4": "last 4 digits or null",
  "currency": "AED or INR",
  "country": "UAE or India",
  "period_from": "YYYY-MM-DD",
  "period_to": "YYYY-MM-DD",
  "closing_balance": 1234.56,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "merchant": "Clean merchant name",
      "description": "Full description",
      "amount": 123.45,
      "txn_type": "expense or income",
      "category": "Food | Shopping | Utilities | Transport | Health | Entertainment | Travel | Education | Investment | EMI/Loan | Salary | Transfer | Other"
    }
  ]
}

Rules:
- Extract EVERY transaction
- Credit card debits = expense, credits = income/payment
- Clean merchant names (not ALLCAPS)
- Positive amounts only
- YYYY-MM-DD dates`

    const result = await model.generateContent([
      { inlineData: { mimeType: file.type as any, data: base64 } },
      prompt
    ])

    const raw = result.response.text()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Invalid JSON from Gemini')

    const parsed = JSON.parse(jsonMatch[0])
    const transactions = parsed.transactions ?? []

    // Find or create matching account
    let { data: account } = await supabase.from('accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('bank_name', parsed.bank_name ?? bankHint ?? 'Unknown')
      .maybeSingle()

    if (!account) {
      const { data: newAcc } = await supabase.from('accounts').insert({
        user_id: user.id,
        name: `${parsed.bank_name ?? bankHint} ${parsed.account_last4 ? `••••${parsed.account_last4}` : ''}`,
        bank_name: parsed.bank_name ?? bankHint ?? 'Unknown',
        account_type: fileType === 'credit_card_statement' ? 'credit_card' : 'savings',
        currency: parsed.currency ?? 'INR',
        country: parsed.country ?? 'India',
        last_four: parsed.account_last4,
      }).select().single()
      account = newAcc
    }

    // Bulk insert transactions
    if (transactions.length > 0) {
      const rows = transactions.map((t: any) => ({
        user_id: user.id,
        account_id: account?.id ?? null,
        txn_date: t.date,
        merchant: t.merchant,
        description: t.description,
        category: t.category ?? 'Other',
        amount: Math.abs(Number(t.amount)),
        currency: parsed.currency ?? 'INR',
        country: parsed.country ?? 'India',
        txn_type: t.txn_type ?? 'expense',
        source: 'statement_upload',
        upload_id: uploadRecord?.id,
        is_verified: false,
      }))

      await supabase.from('transactions').insert(rows)
    }

    // Update upload record
    await supabase.from('statement_uploads').update({
      status: 'completed',
      txns_parsed: transactions.length,
      bank_name: parsed.bank_name,
      currency: parsed.currency,
      country: parsed.country,
      ai_raw_response: parsed,
    }).eq('id', uploadRecord!.id)

    return NextResponse.json({
      success: true,
      bank_name: parsed.bank_name,
      currency: parsed.currency,
      country: parsed.country,
      period: { from: parsed.period_from, to: parsed.period_to },
      transactions_count: transactions.length,
      transactions: transactions.slice(0, 5), // preview
      upload_id: uploadRecord?.id,
    })

  } catch (err: any) {
    await supabase.from('statement_uploads').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', uploadRecord!.id)

    return NextResponse.json({ error: 'Failed to parse statement', details: err.message }, { status: 500 })
  }
}
