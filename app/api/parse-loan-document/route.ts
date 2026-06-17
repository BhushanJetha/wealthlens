import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Local loan-document parser. No AI — PDF text is extracted with unpdf and the
// loan fields are pulled out with regex. Returns { data } in the same shape the
// AddLoanModal expects (it merges non-null fields into the form).

async function extractText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdfDoc = await getDocumentProxy(bytes, password ? { password } : {}) as any
  let out = ''
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p)
    const tc = await page.getTextContent()
    const items: Array<{ x: number; y: number; s: string }> = []
    for (const it of tc.items) { const i = it as any; if (i.str?.trim() && i.transform) items.push({ x: i.transform[4], y: i.transform[5], s: i.str }) }
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const rows = new Map<number, Array<{ x: number; s: string }>>()
    let key = -1, lastY = NaN
    for (const it of items) {
      if (isNaN(lastY) || Math.abs(it.y - lastY) > 3) { key = Math.round(it.y); lastY = it.y }
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key)!.push({ x: it.x, s: it.s })
    }
    for (const y of Array.from(rows.keys()).sort((a, b) => b - a)) {
      const line = rows.get(y)!.sort((a, b) => a.x - b.x).map(c => c.s).join(' ').trim()
      if (line) out += line + '\n'
    }
    out += '\n'
  }
  return out
}

const AMT = '(?:rs\\.?|inr|aed|aed\\.|₹|dhs\\.?|dirhams?)?\\s*([\\d,]+(?:\\.\\d+)?)'

function amt(text: string, re: RegExp): number | null {
  const m = text.match(re)
  if (!m) return null
  const n = parseFloat((m[1] || '').replace(/[, ]/g, ''))
  return isNaN(n) || n <= 0 ? null : n
}

// last money-looking token on a line (e.g. the Amount column)
function lastAmt(line: string): number | null {
  const ms = Array.from(line.matchAll(/([\d,]{3,}\.\d{2})/g))
  if (!ms.length) return null
  const n = parseFloat(ms[ms.length - 1][1].replace(/,/g, ''))
  return n > 0 ? n : null
}
function firstDateISO(line: string): string | null {
  const m = line.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/)
  return m ? toISO(m[1]) : null
}
function noteOf(line: string): string {
  return line.replace(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g, '').replace(/[\d,]{3,}\.\d{2}/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
function toISO(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  m = s.match(/(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]*(\d{2,4})/)
  if (m) { const mm = MON[m[2].slice(0, 3).toLowerCase()]; if (mm) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${mm}-${m[1].padStart(2, '0')}` } }
  return null
}
function findDate(text: string, labelRe: RegExp): string | null {
  const m = text.match(labelRe)
  return m ? toISO(m[1]) : null
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const password = (formData.get('password') as string) || undefined
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

    const isPdf = (file.type || '').includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) return NextResponse.json({ error: 'Please upload a PDF loan statement — image scans aren’t supported locally, enter the details manually.' }, { status: 415 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    let T = ''
    try {
      T = await extractText(bytes, password)
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (/password|encrypted/i.test(msg)) return NextResponse.json({ error: 'This PDF is password-protected.', needsPassword: true }, { status: 422 })
      return NextResponse.json({ error: 'Could not read the PDF text.' }, { status: 422 })
    }
    T = T.replace(/ /g, ' ')

    const currency = /\b(aed|dhs|dirham|درهم)\b/i.test(T) ? 'AED' : 'INR'

    // ── Transaction tables: disbursements, prepayments, EMIs paid ──────────
    const ORDINAL = '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\\d{1,2}(?:st|nd|rd|th))'
    const disbursements: { txn_date: string; amount: number; note: string }[] = []
    const prepayments:   { txn_date: string; amount: number; note: string }[] = []
    let emisReceived = 0, emisDue = 0
    for (const line of T.split('\n')) {
      const L = line.trim()
      if (!L) continue
      const rec = L.match(/payment\s+received\s+emi\s+no[:\s]*?(\d+)/i)
      if (rec) emisReceived = Math.max(emisReceived, parseInt(rec[1]))
      const due = L.match(/installment\s+(\d+)\s+due/i)
      if (due) emisDue = Math.max(emisDue, parseInt(due[1]))
      if (new RegExp(ORDINAL + '\\s+disbursement', 'i').test(L)) {
        const d = firstDateISO(L), a = lastAmt(L)
        if (d && a) disbursements.push({ txn_date: d, amount: a, note: noteOf(L) })
      } else if (/prepayment/i.test(L)) {
        const d = firstDateISO(L), a = lastAmt(L)
        if (d && a) prepayments.push({ txn_date: d, amount: a, note: noteOf(L) || 'Prepayment' })
      }
    }
    const sumDisbursed = disbursements.reduce((s, d) => s + d.amount, 0)
    const emisPaidFromTable = emisReceived || (emisDue > 0 ? emisDue - 1 : 0)

    const loan_type =
      /home\s*loan|housing\s*loan|mortgage/i.test(T) ? 'home_loan' :
      /(?:\bcar\b|\bauto\b|vehicle)\s*loan/i.test(T) ? 'car_loan' :
      /bike\s*loan|two[\s-]?wheeler/i.test(T) ? 'bike_loan' :
      /gold\s*loan/i.test(T) ? 'gold_loan' :
      /loan\s*on\s*card|flexi\s*loan|card\s*loan/i.test(T) ? 'loan_on_card' :
      /personal\s*loan/i.test(T) ? 'personal_loan' : 'other_loan'

    const LENDERS: [RegExp, string][] = [
      [/hdfc/i, 'HDFC Bank'], [/icici/i, 'ICICI Bank'], [/state bank|\bsbi\b/i, 'State Bank of India'],
      [/axis/i, 'Axis Bank'], [/kotak/i, 'Kotak Mahindra Bank'], [/bajaj/i, 'Bajaj Finserv'],
      [/tata capital/i, 'Tata Capital'], [/lic housing|lichfl/i, 'LIC Housing Finance'],
      [/emirates nbd|\benbd\b/i, 'Emirates NBD'], [/\badcb\b/i, 'ADCB'], [/\bfab\b|first abu dhabi/i, 'First Abu Dhabi Bank'],
      [/mashreq/i, 'Mashreq Bank'], [/dubai islamic|\bdib\b/i, 'Dubai Islamic Bank'],
      [/yes bank/i, 'Yes Bank'], [/idfc/i, 'IDFC First Bank'], [/indusind/i, 'IndusInd Bank'],
      [/punjab national|\bpnb\b/i, 'Punjab National Bank'], [/canara/i, 'Canara Bank'], [/bank of baroda|\bbob\b/i, 'Bank of Baroda'],
    ]
    let bank_name: string | null = null
    for (const [re, nm] of LENDERS) if (re.test(T)) { bank_name = nm; break }

    const sanctioned_amt = amt(T, new RegExp('(?:loan\\s*amount\\s*sanctioned|sanction(?:ed)?\\s*(?:loan\\s*)?amount|loan\\s*amount|sanction(?:ed)?\\s*limit|finance\\s*amount)\\s*[:\\-]?\\s*' + AMT, 'i'))
    const disbursed_amt = amt(T, new RegExp('(?:loan\\s*amount\\s*disbursed|amount\\s*disbursed|disbursed\\s*amount|total\\s*disbursed|disbursal\\s*amount|disbursement\\s*amount)\\s*[:\\-]?\\s*' + AMT, 'i'))
    const outstanding_amt = amt(T, new RegExp('(?:principal\\s*outstanding|outstanding\\s*(?:principal|balance|amount)|balance\\s*outstanding|current\\s*(?:outstanding|balance)|closing\\s*balance|o/?s\\s*principal|loan\\s*outstanding|outstanding)\\s*[:\\-]?\\s*' + AMT, 'i'))
    const emi_amount = amt(T, new RegExp('(?:emi\\s*amount|monthly\\s*(?:installment|instalment|payment|emi)|installment\\s*amount|instalment\\s*amount|equated\\s*monthly|\\bemi\\b)\\s*[:\\-]?\\s*' + AMT, 'i'))

    let interest_rate: number | null = null
    {
      const m = T.match(/(?:rate of interest|interest rate|\broi\b|\brate\b)\s*[:\-]?\s*([\d.]+)\s*%?/i) || T.match(/([\d.]+)\s*%\s*(?:p\.?\s*a\.?|per annum)/i)
      if (m) { const r = parseFloat(m[1]); if (r > 0 && r < 100) interest_rate = r }
    }

    let tenure_months: number | null = null
    {
      let m = T.match(/(?:tenure|term|loan\s*period|repayment\s*period)\s*[:\-]?\s*(\d{1,3})\s*(?:month|months|mos|mths)\b/i)
      if (m) tenure_months = parseInt(m[1])
      if (tenure_months === null) { m = T.match(/(?:tenure|term|loan\s*period|repayment\s*period)\s*[:\-]?\s*(\d{1,2})\s*(?:year|years|yrs?)\b/i); if (m) tenure_months = parseInt(m[1]) * 12 }
      if (tenure_months === null) { m = T.match(/(?:total\s*)?(?:no\.?\s*of\s*)?(?:installments|instalments|emis)\s*[:\-]?\s*(\d{1,3})/i); if (m) tenure_months = parseInt(m[1]) }
    }

    // Balance tenor (remaining term) — used to derive months_paid if needed
    let balance_tenor: number | null = null
    {
      let m = T.match(/(?:balance|remaining|residual)\s*ten(?:ure|or)\s*[:\-]?\s*(\d{1,3})\s*(?:month|months|mos|mths)?/i)
      if (m) balance_tenor = parseInt(m[1])
      if (balance_tenor === null) { m = T.match(/(?:balance|remaining|residual)\s*ten(?:ure|or)\s*[:\-]?\s*(\d{1,2})\s*(?:year|years|yrs?)/i); if (m) balance_tenor = parseInt(m[1]) * 12 }
    }

    let months_paid: number | null = null
    {
      const m = T.match(/(?:emis?\s*paid|installments?\s*paid|instalments?\s*paid|paid\s*(?:installments?|instalments?|emis?)|no\.?\s*of\s*emis?\s*paid)\s*[:\-]?\s*(\d{1,3})/i)
      if (m) months_paid = parseInt(m[1])
    }
    if (months_paid === null && tenure_months != null && balance_tenor != null) {
      months_paid = Math.max(0, tenure_months - balance_tenor)
    }

    const loan_start_date = findDate(T, /(?:disbursement\s*date|date\s*of\s*disbursement|loan\s*start\s*date|sanction\s*date|first\s*(?:emi|installment|instalment)\s*date)\s*[:\-]?\s*([0-9A-Za-z\/\-. ]{6,14})/i)
    const next_emi_date  = findDate(T, /(?:next\s*emi\s*date|next\s*due\s*date|next\s*(?:installment|instalment)\s*date|due\s*date)\s*[:\-]?\s*([0-9A-Za-z\/\-. ]{6,14})/i)

    let property_address: string | null = null
    if (loan_type === 'home_loan') {
      const m = T.match(/(?:property\s*address|address\s*of\s*(?:the\s*)?property|property\s*details)\s*[:\-]?\s*(.{8,120})/i)
      if (m) property_address = m[1].split(/\n/)[0].trim()
    }

    const typeLabel: Record<string, string> = { home_loan: 'Home Loan', car_loan: 'Car Loan', bike_loan: 'Bike Loan', gold_loan: 'Gold Loan', loan_on_card: 'Loan on Card', personal_loan: 'Personal Loan', other_loan: 'Loan' }
    const name = `${typeLabel[loan_type]}${bank_name ? ' – ' + bank_name : ''}`

    const out: Record<string, any> = {
      name, bank_name, loan_type, sanctioned_amt,
      disbursed_amt: sumDisbursed > 0 ? sumDisbursed : disbursed_amt,
      outstanding_amt, emi_amount, interest_rate, tenure_months,
      months_paid: emisPaidFromTable || months_paid,
      loan_start_date, next_emi_date, currency, property_address,
    }
    const cleaned: Record<string, any> = {}
    for (const [k, v] of Object.entries(out)) if (v !== null && v !== undefined && v !== '') cleaned[k] = v

    const transactions = { disbursements, prepayments }
    const gotFigures = sanctioned_amt || disbursed_amt || outstanding_amt || emi_amount || interest_rate || disbursements.length

    if (!gotFigures) {
      return NextResponse.json({
        data: cleaned,
        transactions,
        warning: 'Could not confidently read the loan figures — please verify and fill in the rest manually.',
        _rawPreview: T.slice(0, 1200),
      })
    }
    return NextResponse.json({ data: cleaned, transactions })
  } catch (err: any) {
    console.error('parse-loan-document error:', err)
    return NextResponse.json({ error: 'Failed to parse document', details: err.message }, { status: 500 })
  }
}
