import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'

const CATEGORIES = ['Food', 'Shopping', 'Utilities', 'Transport', 'Health', 'Entertainment', 'Travel', 'Education', 'Investment', 'EMI/Loan',
  'Salary', 'Dividend', 'Rental', 'Gift', 'Bonus', 'Tax Refund', 'Interest', 'Freelance', 'Other']

// Structured output: the reply is always a transaction matching this schema
const SCHEMA = {
  type: 'object',
  properties: {
    txn_date: { type: 'string', description: 'YYYY-MM-DD' },
    merchant: { type: 'string' },
    description: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string', enum: ['INR', 'AED'] },
    txn_type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: CATEGORIES },
  },
  required: ['txn_date', 'merchant', 'description', 'amount', 'currency', 'txn_type', 'category'],
  additionalProperties: false,
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, defaultType } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = await askClaude({
      effort: 'low',
      maxTokens: 4000,
      schema: SCHEMA,
      system: `Extract one financial transaction from what the user said. Today is ${today}.
- txn_type: "${defaultType === 'income' ? 'income' : 'expense'}" unless the words clearly say otherwise.
- currency: AED for dirhams/AED, INR for rupees/lakh/crore; INR if nothing is said.
- txn_date: resolve "yesterday", "on the 15th" etc. against today; today if no date.
- amount: positive number; "1.5 lakh" = 150000.
- merchant: the shop, payee or income source; description: a few words.`,
      messages: [{ role: 'user', content: text }],
    })
    return NextResponse.json({ transaction: JSON.parse(raw) })
  } catch (err) {
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
