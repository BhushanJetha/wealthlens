import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractStructuredText, pdfPasswordError } from '@/lib/pdfText'
import { parseInsuranceText } from '@/lib/insuranceParser'

// Policy PDF → fields for the Add-policy form. Read locally (no AI), nothing
// stored or saved here: the user checks the form and saves it themselves.
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const password = (formData.get('password') as string | null) || undefined
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
    return NextResponse.json({ error: 'Upload the policy as a PDF, or add it by hand.' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'That PDF is over 20 MB.' }, { status: 400 })

  let text: string
  try {
    text = await extractStructuredText(new Uint8Array(await file.arrayBuffer()), password)
  } catch (err: any) {
    const pw = pdfPasswordError(err, !!password)
    if (pw === 'wrong') return NextResponse.json({ wrongPassword: true, error: 'Incorrect password. Please try again.' }, { status: 400 })
    if (pw === 'needs') return NextResponse.json({ encrypted: true })
    return NextResponse.json({ error: 'Could not read this PDF.' }, { status: 422 })
  }

  if (!text.trim()) return NextResponse.json({
    error: 'No text found in this PDF. It may be a scanned image, so please add the policy by hand.',
  }, { status: 422 })

  const policy = parseInsuranceText(text)
  const found = ['provider', 'policy_number', 'sum_assured', 'annual_premium', 'start_date', 'expiry_date'].filter(k => (policy as any)[k] != null)
  return NextResponse.json({ policy, found: found.length, of: 6 })
}
