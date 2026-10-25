import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'

// Image types Claude can read; HEIC (iPhone default) must be saved as JPG first
const SUPPORTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type Supported = (typeof SUPPORTED)[number]

const SCHEMA = {
  type: 'object',
  properties: {
    txn_date: { type: 'string', description: 'YYYY-MM-DD' },
    merchant: { type: 'string' },
    description: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string', enum: ['INR', 'AED'] },
    txn_type: { type: 'string', enum: ['expense', 'income'] },
    category: { type: 'string', enum: ['Food', 'Shopping', 'Utilities', 'Transport', 'Health', 'Entertainment', 'Travel', 'Education', 'Investment', 'Other'] },
  },
  required: ['txn_date', 'merchant', 'description', 'amount', 'currency', 'txn_type', 'category'],
  additionalProperties: false,
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const fileType = (formData.get('fileType') as string) ?? 'expense_bill'
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!SUPPORTED.includes(file.type as Supported)) {
    return NextResponse.json({ error: 'Unsupported image', details: 'Use a JPG, PNG or WebP photo (HEIC photos: share or save as JPG first).' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large', details: 'Use a photo under 5 MB.' }, { status: 400 })
  }

  const data = Buffer.from(await file.arrayBuffer()).toString('base64')
  const today = new Date().toISOString().slice(0, 10)
  const txnType = fileType === 'income_receipt' ? 'income' : 'expense'

  try {
    const raw = await askClaude({
      effort: 'low',
      maxTokens: 4000,
      schema: SCHEMA,
      system: `Read one bill or receipt photo and return it as a single transaction. Today is ${today}.
- amount: the total paid or due (positive), not a subtotal or tax line.
- currency: AED for dirhams/AED, INR for rupees; INR if unclear.
- txn_date: the date printed on the receipt; today if none is visible.
- txn_type: "${txnType}".`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: file.type as Supported, data } },
          { type: 'text', text: 'Extract the transaction from this receipt.' },
        ],
      }],
    })
    return NextResponse.json({ transaction: JSON.parse(raw) })
  } catch (err) {
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
