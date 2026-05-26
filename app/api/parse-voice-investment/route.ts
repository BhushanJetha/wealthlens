import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, investmentType } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const systemPrompt = `You are a financial data extraction assistant. The user will describe an investment verbally. Extract structured investment data.

Return ONLY valid JSON (no markdown):
{
  "type": "${investmentType ?? 'mutual_fund'}",
  "name": "investment name",
  "amount": 100000,
  "units": null,
  "nav": null,
  "purchase_date": "YYYY-MM-DD or null",
  "maturity_date": "YYYY-MM-DD or null",
  "interest_rate": null,
  "current_value": null,
  "currency": "INR or AED",
  "notes": "any extra info"
}

Rules:
- Infer fields from natural language
- Use null for fields not mentioned
- Today's date if purchase date not mentioned: ${new Date().toISOString().slice(0, 10)}
- Positive amounts only`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    })

    const raw = (message.content[0] as any).text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse AI response')

    const investment = JSON.parse(jsonMatch[0])

    return NextResponse.json({ success: true, investment })
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse voice input', details: err.message }, { status: 500 })
  }
}
