import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'
import { AI_OFF, Vault, aiSettingsOf, mask, namesToHide, numberBack } from '@/lib/ai/privacy'

const CATEGORIES = ['Food', 'Shopping', 'Utilities', 'Travel & transport', 'Health', 'Entertainment', 'Education', 'Investment', 'EMI/Loan',
  'Salary', 'Dividend', 'Rental', 'Gift', 'Bonus', 'Tax Refund', 'Interest', 'Freelance', 'Other']

// Structured output: the reply is always a transaction matching this schema.
// Claude never hears the amount: numbers are sent as placeholders like [A1]
// and the real figure is put back here.
const SCHEMA = {
  type: 'object',
  properties: {
    txn_date: { type: 'string', description: 'YYYY-MM-DD' },
    merchant: { type: 'string' },
    description: { type: 'string' },
    amount: { type: 'string', description: 'the placeholder for the amount, e.g. [A1]' },
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
  if (!aiSettingsOf(user.user_metadata).on) return NextResponse.json(AI_OFF, { status: 403 })

  const { text, defaultType } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('family_members').select('name').eq('user_id', user.id),
  ])
  const vault = new Vault()
  const said = mask(text, vault, namesToHide({ fullName: profile?.full_name, members: members ?? [] }), { allNumbers: true })
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = await askClaude({
      effort: 'low',
      maxTokens: 4000,
      schema: SCHEMA,
      system: `Extract one financial transaction from what the user said. Today is ${today}.
- Numbers are hidden as placeholders like [A1]. amount: copy the placeholder that is the amount exactly; never guess a value.
- txn_type: "${defaultType === 'income' ? 'income' : 'expense'}" unless the words clearly say otherwise.
- currency: AED for dirhams/AED, INR for rupees/lakh/crore; INR if nothing is said.
- txn_date: resolve "yesterday", "on the 15th" etc. against today; today if no date.
- merchant: the shop, payee or income source; description: a few words. *** is a hidden name; leave it out.`,
      messages: [{ role: 'user', content: said }],
    })
    const t = JSON.parse(raw)
    const amount = numberBack(t.amount, vault)
    return NextResponse.json({ transaction: { ...t, amount: amount != null ? Math.abs(amount) : null, merchant: vault.restore(t.merchant ?? ''), description: vault.restore(t.description ?? '') } })
  } catch (err) {
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
