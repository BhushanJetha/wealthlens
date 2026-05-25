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
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const base64 = Buffer.from(bytes).toString('base64')
  const fileName = `${user.id}/${Date.now()}_${file.name}`

  await supabase.storage.from('insurance-docs').upload(fileName, bytes, { contentType: file.type })

  const { data: publicUrl } = supabase.storage.from('insurance-docs').getPublicUrl(fileName)

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

    const prompt = `Extract all key details from this insurance policy document.
Return ONLY valid JSON (no markdown, no code blocks):
{
  "policy_name": "name/type",
  "policy_number": "policy number or null",
  "provider": "insurance company",
  "policy_type": "term_life | health | property | vehicle | travel | other",
  "insured_members": ["names covered"],
  "sum_assured": 1000000,
  "annual_premium": 25000,
  "premium_frequency": "monthly | quarterly | semi_annual | annual",
  "start_date": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD",
  "next_premium_date": "YYYY-MM-DD or null",
  "currency": "AED or INR",
  "country": "UAE or India",
  "key_benefits": ["benefit 1", "benefit 2"],
  "agent_contact": "agent info or null"
}`

    const result = await model.generateContent([
      { inlineData: { mimeType: file.type as any, data: base64 } },
      prompt
    ])

    const raw = result.response.text()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Invalid JSON from Gemini')
    const parsed = JSON.parse(jsonMatch[0])

    // Insert insurance policy
    const { data: policy } = await supabase.from('insurance_policies').insert({
      user_id: user.id,
      policy_name: parsed.policy_name ?? 'Insurance Policy',
      policy_number: parsed.policy_number,
      provider: parsed.provider ?? 'Unknown',
      policy_type: parsed.policy_type ?? 'other',
      sum_assured: parsed.sum_assured,
      annual_premium: parsed.annual_premium ?? 0,
      premium_frequency: parsed.premium_frequency ?? 'annual',
      start_date: parsed.start_date,
      expiry_date: parsed.expiry_date,
      next_premium_date: parsed.next_premium_date,
      currency: parsed.currency ?? 'INR',
      country: parsed.country ?? 'India',
      insured_members: parsed.insured_members ?? [],
      document_url: publicUrl.publicUrl,
      key_benefits: parsed.key_benefits ?? [],
      ai_extracted_data: parsed,
      is_active: true,
    }).select().single()

    return NextResponse.json({ success: true, policy })

  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to parse document', details: err.message }, { status: 500 })
  }
}
