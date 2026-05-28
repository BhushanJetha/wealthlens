import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, defaultType } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  const prompt = `Extract a single financial transaction from this voice input. Today's date is ${today}.

Voice input: "${text}"

Return ONLY valid JSON (no markdown, no code blocks):
{
  "txn_date": "YYYY-MM-DD",
  "merchant": "merchant or income source name",
  "description": "brief description",
  "amount": 1234.56,
  "currency": "INR or AED",
  "txn_type": "expense or income",
  "category": "Food | Shopping | Utilities | Transport | Health | Entertainment | Travel | Education | Investment | EMI/Loan | Salary | Dividend | Rental | Gift | Bonus | Tax Refund | Interest | Freelance | Other"
}

Rules:
- Default txn_type to "${defaultType}" if unclear
- Default currency to INR if no currency mentioned
- Use today's date if no date mentioned
- Positive amounts only`

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse response')
    const transaction = JSON.parse(jsonMatch[0])
    return NextResponse.json({ transaction })
  } catch (err: any) {
    return NextResponse.json({ error: 'Parsing failed', details: err.message }, { status: 500 })
  }
}
