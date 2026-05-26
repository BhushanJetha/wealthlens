import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `You are a loan document parser. Extract loan details from this document (sanction letter, repayment schedule, loan statement, or agreement).

Return ONLY a valid JSON object with these exact fields. Use null for any field not found in the document:
{
  "name": "short descriptive loan name (e.g., Home Loan - HDFC)",
  "bank_name": "bank or lender name",
  "loan_type": "one of: home_loan, car_loan, bike_loan, gold_loan, loan_on_card, personal_loan, other_loan",
  "sanctioned_amt": number or null,
  "outstanding_amt": number or null,
  "emi_amount": number or null,
  "interest_rate": number or null (annual percentage, e.g., 8.5),
  "tenure_months": number or null,
  "months_paid": number or null,
  "loan_start_date": "YYYY-MM-DD" or null,
  "next_emi_date": "YYYY-MM-DD" or null,
  "currency": "INR" or "AED",
  "property_address": "address string" or null
}

Return ONLY the JSON object, no other text.`

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType: file.type || 'application/pdf' } },
      prompt,
    ])

    const text  = result.response.text().trim()
    const match = text.match(/\{[\s\S]+\}/)
    if (!match) return NextResponse.json({ error: 'Could not extract data from document' }, { status: 422 })

    const parsed = JSON.parse(match[0])

    // Clean up: remove null values and convert string numbers
    const cleaned: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined && v !== '') cleaned[k] = v
    }

    return NextResponse.json({ data: cleaned })
  } catch (err: any) {
    console.error('parse-loan-document error:', err)
    return NextResponse.json({ error: 'Failed to parse document', details: err.message }, { status: 500 })
  }
}
