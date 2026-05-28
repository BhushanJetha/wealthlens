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
  const fileType = (formData.get('fileType') as string) ?? 'expense_bill'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const today = new Date().toISOString().slice(0, 10)
  const defaultTxnType = fileType === 'income_receipt' ? 'income' : 'expense'

  const prompt = `Extract a single financial transaction from this bill/receipt image. Today's date is ${today}.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "txn_date": "YYYY-MM-DD",
  "merchant": "merchant or payee name",
  "description": "brief description",
  "amount": 1234.56,
  "currency": "INR or AED",
  "txn_type": "${defaultTxnType}",
  "category": "Food | Shopping | Utilities | Transport | Health | Entertainment | Travel | Education | Investment | Other"
}

Rules:
- Extract the total amount due/paid
- Positive amounts only
- Use today's date if no date visible`

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent([
      { inlineData: { mimeType: file.type as any, data: base64 } },
      prompt,
    ])
    const raw = result.response.text()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse image')
    const transaction = JSON.parse(jsonMatch[0])
    return NextResponse.json({ transaction })
  } catch (err: any) {
    return NextResponse.json({ error: 'Parsing failed', details: err.message }, { status: 500 })
  }
}
