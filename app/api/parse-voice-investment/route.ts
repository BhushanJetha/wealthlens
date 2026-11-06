import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'
import { AI_OFF, Vault, aiSettingsOf, mask, namesToHide, numberBack } from '@/lib/ai/privacy'

// Numbers go to Claude as placeholders like [A1]; the real amount, units, NAV
// and value are put back here. Interest rates (7.1%) and dates are kept.
const NUMS = ['amount', 'units', 'nav', 'current_value'] as const
const field = { type: ['string', 'null'] }
const SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    name: { type: 'string' },
    amount: { ...field, description: 'placeholder like [A1], or null' },
    units: { ...field, description: 'placeholder, or null' },
    nav: { ...field, description: 'placeholder, or null' },
    current_value: { ...field, description: 'placeholder, or null' },
    purchase_date: { ...field, description: 'YYYY-MM-DD or null' },
    maturity_date: { ...field, description: 'YYYY-MM-DD or null' },
    interest_rate: { type: ['number', 'null'] },
    currency: { type: 'string', enum: ['INR', 'AED'] },
    notes: { type: 'string' },
  },
  required: ['type', 'name', 'amount', 'units', 'nav', 'current_value', 'purchase_date', 'maturity_date', 'interest_rate', 'currency', 'notes'],
  additionalProperties: false,
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!aiSettingsOf(user.user_metadata).on) return NextResponse.json(AI_OFF, { status: 403 })

  const { text, investmentType } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase.from('family_members').select('name').eq('user_id', user.id),
  ])
  const vault = new Vault()
  const said = mask(text, vault, namesToHide({ fullName: profile?.full_name, members: members ?? [] }), { allNumbers: true })

  try {
    const raw = await askClaude({
      effort: 'low',
      maxTokens: 4000,
      schema: SCHEMA,
      system: `The user describes an investment out loud. Extract it.
- type: "${investmentType ?? 'mutual_fund'}".
- Numbers are hidden as placeholders like [A1]. For amount, units, nav and current_value copy the right placeholder exactly, or null; never guess a value.
- interest_rate: the percentage as a number, or null. currency: AED for dirhams, INR for rupees; INR if nothing is said.
- purchase_date: today (${new Date().toISOString().slice(0, 10)}) if not mentioned. Use null for anything else not mentioned.
- *** is a hidden name; leave it out.`,
      messages: [{ role: 'user', content: said }],
    })
    const inv = JSON.parse(raw)
    for (const k of NUMS) { const n = numberBack(inv[k], vault); inv[k] = n != null ? Math.abs(n) : null }
    inv.name = vault.restore(inv.name ?? ''); inv.notes = vault.restore(inv.notes ?? '')
    return NextResponse.json({ success: true, investment: inv })
  } catch (err) {
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
