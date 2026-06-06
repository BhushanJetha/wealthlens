import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ──── Local holdings statement parser (no AI) ─────────────────────────
//
// Deterministic parser for the CAMS / KFintech Mutual Fund Consolidated
// Account Statement (CAS). Extracts each scheme's current holding (units,
// cost value, market value, NAV) plus the full transaction history, so the
// app can show invested-vs-current value and build month/year analytics.
//
// Text is extracted locally with unpdf (handles password-protected PDFs);
// nothing leaves the server and no external API is called.

// ──── PDF text extraction — row-aware, local ──────────────────────────

async function extractStructuredText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdfDoc = await getDocumentProxy(bytes, password ? { password } : {}) as any

  let fullText = ''
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page        = await pdfDoc.getPage(p)
    const textContent = await page.getTextContent()

    const rawItems: Array<{ x: number; y: number; str: string }> = []
    for (const item of textContent.items) {
      const i = item as any
      if (!i.str?.trim() || !i.transform) continue
      rawItems.push({ x: i.transform[4], y: i.transform[5], str: i.str })
    }
    rawItems.sort((a, b) => b.y - a.y || a.x - b.x)

    const rowMap = new Map<number, Array<{ x: number; str: string }>>()
    let rowKey = -1, lastY = NaN
    for (const item of rawItems) {
      if (isNaN(lastY) || Math.abs(item.y - lastY) > 3) { rowKey = Math.round(item.y); lastY = item.y }
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, [])
      rowMap.get(rowKey)!.push({ x: item.x, str: item.str })
    }
    const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const line = rowMap.get(y)!.sort((a, b) => a.x - b.x).map(c => c.str).join(' ').trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

// ──── helpers ─────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function camsDateToISO(s: string): string | null {
  const m = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/)
  if (!m) return null
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
  const mm   = MONTHS[m[2].toLowerCase()]
  if (!mm) return null
  return `${yyyy}-${mm}-${m[1].padStart(2, '0')}`
}

function pnum(s?: string | null): number | null {
  if (s == null) return null
  const n = parseFloat(String(s).replace(/[(),₹]/g, '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? null : n
}

function classifyFundType(name: string): string {
  const n = name.toLowerCase()
  if (/elss|tax\s*saver|tax\s*saving/.test(n)) return 'elss'
  if (/liquid|overnight|money\s*market/.test(n)) return 'liquid'
  if (/index|nifty|sensex|etf\b/.test(n)) return 'index'
  if (/hybrid|balanced|advantage|asset\s*alloc|multi\s*asset|equity\s*savings|arbitrage/.test(n)) return 'hybrid'
  if (/debt|bond|gilt|credit\s*risk|corporate\s*bond|duration|income|g-?sec|liquid|treasury|banking\s*&?\s*psu/.test(n)) return 'debt'
  return 'equity'
}

function classifyTxn(desc: string): string {
  const d = desc.toLowerCase()
  if (/redemption|redeem|withdrawal/.test(d)) return 'redemption'
  if (/switch\s*out/.test(d)) return 'switch_out'
  if (/switch\s*in/.test(d)) return 'switch_in'
  if (/sip|systematic\s*investment/.test(d)) return 'sip'
  if (/dividend|idcw|payout|reinvest/.test(d)) return 'dividend'
  if (/stamp\s*duty|stt|tax/.test(d)) return 'charge'
  if (/purchase|investment|subscription/.test(d)) return 'purchase'
  return 'other'
}

// Lines that must never be treated as a scheme name (notes / legends / headers)
const NOTE_RE = /entry\s*load|exit\s*load|redeem|switch(ed)?\s*(out|in)|nav\s*of\s*the|please\s*note|disclaimer|nominee|stamp\s*duty|past\s*performance|subject\s*to\s*market|opening\s*unit|closing\s*unit|folio\s*no|grand\s*total|total\s*(investment|cost|value)|registrar\s*:?\s*$/i

const FUND_KW = /fund|plan|growth|\betf\b|scheme|equity|debt|\bcap\b|bond|gold|silver|index|advantage|idcw|dividend|hybrid|balanced|liquid|savings|flexi|focus|value|momentum|nifty|sensex|gilt|arbitrage|multi|pension|elss|tax\s*saver/i

// A KFintech/CAMS scheme line begins with a scheme-code prefix, e.g.
// "128EFDGG-Axis Large Cap Fund - Direct Plan - Growth" or "P8042-ICICI ...".
function isSchemeLine(l: string): boolean {
  return /^[A-Z0-9]{4,12}-\s*[A-Za-z]/.test(l) && FUND_KW.test(l) && !NOTE_RE.test(l)
}

// Strip the scheme-code prefix and trailing registrar/ISIN/advisor metadata.
function cleanSchemeName(l: string): string {
  return l
    .replace(/^[A-Z0-9]{4,12}-\s*/, '')
    .replace(/\bISIN\b.*$/i, '')
    .replace(/\bRegistrar\b.*$/i, '')
    .replace(/\(\s*Advisor[^)]*\)/ig, '')
    .replace(/\bAdvisor\s*:.*$/i, '')
    .replace(/\((?:Non[- ]?Demat|Demat)\)/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Detect a SIP: the same amount invested in 3+ distinct months.
// Returns the amount and the most-common day-of-month as the SIP date.
function detectSip(txns: any[], asOf?: string | null): { has_sip: boolean; sip_amount: number | null; sip_date: number | null } {
  const inactive = { has_sip: false, sip_amount: null, sip_date: null }
  const buys = txns.filter(t => (t.type === 'sip' || t.type === 'purchase') && t.amount > 0)
  if (buys.length < 3) return inactive
  const byAmt: Record<string, any[]> = {}
  for (const t of buys) { const k = String(Math.round(t.amount)); (byAmt[k] ||= []).push(t) }
  let best: { amount: number; date: number; months: number; latest: string } | null = null
  for (const [amt, list] of Object.entries(byAmt)) {
    const months = new Set(list.map((t: any) => t.date.slice(0, 7)))
    if (months.size >= 3 && (!best || months.size > best.months)) {
      const dayFreq: Record<number, number> = {}
      list.forEach((t: any) => { const d = parseInt(t.date.slice(8, 10)); if (d) dayFreq[d] = (dayFreq[d] || 0) + 1 })
      const top    = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]
      const latest = list.map((t: any) => t.date).filter(Boolean).sort().slice(-1)[0]
      best = { amount: Number(amt), date: top ? Math.min(28, Math.max(1, Number(top[0]))) : 1, months: months.size, latest }
    }
  }
  if (!best) return inactive

  // Only treat as an ACTIVE SIP if the most recent installment is within 3 months
  // of the statement's latest activity — otherwise the SIP has stopped.
  const ref = asOf ? new Date(asOf) : new Date()
  if (best.latest) {
    const [ly, lm] = best.latest.slice(0, 7).split('-').map(Number)
    const monthsAgo = (ref.getFullYear() - ly) * 12 + (ref.getMonth() + 1 - lm)
    if (monthsAgo >= 3) return inactive
  }
  return { has_sip: true, sip_amount: best.amount, sip_date: best.date }
}

function extractHolding(fundName: string, folio: string | null, txnLines: string[], valText: string, currency: string) {
  const units       = pnum(valText.match(/closing\s+unit\s+balance[:\s]*([\d,]+\.\d+)/i)?.[1])
  const current_nav = pnum(valText.match(/NAV\s+on\s+\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+\.\d+)/i)?.[1])
  let   invested      = pnum(valText.match(/(?:total\s+)?cost\s+value[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+\.\d+)/i)?.[1])
  let   current_value = pnum(valText.match(/market\s+value\s+on\s+\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}[:\s]*(?:INR|Rs\.?|₹)?\s*([\d,]+\.\d+)/i)?.[1])

  const txns: any[] = []
  let purchaseSum = 0
  for (const l of txnLines) {
    const tm = l.match(/^(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4})\s+(.+?)\s+\(?(-?[\d,]+\.\d{2})\)?\s+\(?(-?[\d,]+\.\d{2,4})\)?\s+([\d,]+\.\d{2,4})\s+([\d,]+\.\d{2,4})\s*$/)
    if (!tm) continue
    const date = camsDateToISO(tm[1]); if (!date) continue
    const desc = tm[2].replace(/\s+/g, ' ').trim()
    const amount = pnum(tm[3]); if (amount == null) continue
    const type = classifyTxn(desc)
    const isOut = type === 'redemption' || type === 'switch_out' || tm[3].includes('(') || amount < 0
    txns.push({ folio, fund_name: fundName, date, type, description: desc, amount: Math.abs(amount), units: pnum(tm[4]), nav: pnum(tm[5]) })
    if (!isOut && (type === 'purchase' || type === 'sip' || type === 'switch_in')) purchaseSum += Math.abs(amount)
  }

  if (!fundName || units == null || units <= 0) return null
  if (invested == null)      invested = purchaseSum > 0 ? purchaseSum : (current_nav ? units * current_nav : null)
  if (current_value == null && current_nav) current_value = units * current_nav
  if (invested == null || invested <= 0) return null

  return {
    holding: {
      fund_name:       fundName,
      fund_type:       classifyFundType(fundName),
      folio_number:    folio,
      units,
      avg_nav:         invested / units,
      current_nav:     current_nav ?? null,
      invested_amount: Math.round(invested * 100) / 100,
      current_value:   current_value != null ? Math.round(current_value * 100) / 100 : null,
      currency,
      registrar:       null as string | null,   // set by caller (CAMS/KFintech)
      // SIP fields are applied later (need the statement's latest activity for recency)
    },
    txns,
  }
}

// ──── CAMS / KFintech mutual fund CAS parser ──────────────────────────

function parseMutualFundCAS(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  const entries: { holding: any; txns: any[] }[] = []
  const transactions: any[] = []
  const currency = /\bAED\b|UAE\s*Dirham/i.test(text) ? 'AED' : 'INR'

  // Registrar (CAMS vs KFintech) — per scheme line, else statement-wide
  const detectReg = (s: string): 'cams' | 'kfintech' | null =>
    /kfin|karvy/i.test(s) ? 'kfintech' : /\bcams\b/i.test(s) ? 'cams' : null
  const globalReg = detectReg(text)

  let currentFolio: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(/Folio\s*No[:\s.]*([0-9][0-9A-Za-z\/\s-]*?)(?=\s{2,}|PAN|KYC|IIN|Nominee|$)/i)
    if (fm) currentFolio = fm[1].replace(/\s+/g, ' ').trim()

    if (!isSchemeLine(lines[i])) continue

    // Scheme block runs to its "Closing Unit Balance" (before the next scheme line)
    let closeI = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (isSchemeLine(lines[j])) break
      if (/closing\s+unit\s+balance/i.test(lines[j])) { closeI = j; break }
    }
    if (closeI === -1) continue

    const txnLines = lines.slice(i + 1, closeI)
    const valText  = lines.slice(closeI, Math.min(closeI + 5, lines.length)).join('\n')  // valuation sits on/after the closing line
    const res = extractHolding(cleanSchemeName(lines[i]), currentFolio, txnLines, valText, currency)
    if (res) { res.holding.registrar = detectReg(lines[i]) ?? globalReg; entries.push(res); transactions.push(...res.txns) }
    i = closeI
  }

  // Fallback for statements without scheme-code prefixes: anchor on the line
  // directly above "Opening Unit Balance".
  if (entries.length === 0) {
    let folio: string | null = null
    for (let i = 0; i < lines.length; i++) {
      const fm = lines[i].match(/Folio\s*No[:\s.]*([0-9][0-9A-Za-z\/\s-]*?)(?=\s{2,}|PAN|KYC|IIN|Nominee|$)/i)
      if (fm) folio = fm[1].replace(/\s+/g, ' ').trim()
      if (!/opening\s+unit\s+balance/i.test(lines[i])) continue
      // scheme name = nearest fund-keyword, non-note line above
      let name: string | null = null
      for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
        if (FUND_KW.test(lines[k]) && !NOTE_RE.test(lines[k]) && !/^\d{1,2}[-\/][A-Za-z]{3}/.test(lines[k]) && lines[k].length > 8) { name = cleanSchemeName(lines[k]); break }
      }
      let closeI = -1
      for (let j = i + 1; j < lines.length; j++) { if (/closing\s+unit\s+balance/i.test(lines[j])) { closeI = j; break } }
      if (!name || closeI === -1) continue
      const res = extractHolding(name, folio, lines.slice(i + 1, closeI), lines.slice(closeI, Math.min(closeI + 5, lines.length)).join('\n'), currency)
      if (res) { res.holding.registrar = detectReg(lines[i]) ?? globalReg; entries.push(res); transactions.push(...res.txns) }
      i = closeI
    }
  }

  // The statement's latest activity = the recency anchor for "is this SIP still running"
  const asOf = transactions.map(t => t.date).filter(Boolean).sort().slice(-1)[0] ?? null
  const holdings = entries.map(e => ({ ...e.holding, ...detectSip(e.txns, asOf) }))

  return { holdings, transactions }
}

// ──── Demat (NSDL / CDSL) equity holdings parser — best effort ────────

function parseDematStocks(text: string) {
  const out: any[] = []
  if (!/(demat|nsdl|cdsl|holding\s+statement|equit(y|ies)|\bISIN\b)/i.test(text)) return out
  const currency = /\bAED\b/i.test(text) ? 'AED' : 'INR'
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)

  for (const l of lines) {
    // ISIN ... <company name> ... <qty> ... <price> ... <value>
    const m = l.match(/\bIN[A-Z0-9]{9}[0-9]\b\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/)
    if (!m) continue
    const name  = m[1].replace(/\s{2,}/g, ' ').trim()
    const qty   = pnum(m[2])
    const price = pnum(m[3])
    if (!name || qty == null || qty <= 0 || price == null) continue
    out.push({
      symbol:        name.split(/\s+/)[0].toUpperCase(),
      name,
      exchange:      'NSE',
      quantity:      qty,
      avg_buy_price: price,        // demat statements show market price, not cost — user edits in review
      current_price: price,
      sector:        null,
      currency,
    })
  }
  return out
}

// ──── API handler ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file') as File
  const password = (formData.get('password') as string | null) || undefined

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())

  let pdfText: string
  try {
    pdfText = await extractStructuredText(bytes, password)
  } catch (err: any) {
    const name = err?.name ?? ''
    const code = err?.code
    const msg  = (err?.message ?? '').toLowerCase()
    if (name === 'PasswordException' || msg.includes('password') || msg.includes('encrypt')) {
      if (code === 2 || (password && (msg.includes('incorrect') || msg.includes('wrong')))) {
        return NextResponse.json({ wrongPassword: true, error: 'Incorrect password. Please try again.' }, { status: 400 })
      }
      return NextResponse.json({
        encrypted: true,
        hint: 'CAS statements are usually locked with your PAN (UPPERCASE) or the password you set when requesting the statement.',
      })
    }
    return NextResponse.json({ error: 'Failed to read PDF', details: err.message }, { status: 500 })
  }

  if (!pdfText?.trim()) {
    return NextResponse.json({
      error: 'No text found in this PDF. It may be a scanned image rather than a digital statement.',
    }, { status: 400 })
  }

  const { holdings, transactions } = parseMutualFundCAS(pdfText)
  const stocks = parseDematStocks(pdfText)

  const detected = holdings.length && stocks.length ? 'mixed'
    : holdings.length ? 'mutual_funds'
    : stocks.length ? 'stocks'
    : 'none'

  const parseWarning = detected === 'none'
    ? 'No holdings could be read from this statement layout. Copy the preview text below and share it so support for this format can be added.'
    : undefined

  return NextResponse.json({
    success:      true,
    detected,
    mutual_funds: holdings,
    stocks,
    transactions,                      // full history for month/year analytics
    parseWarning,
    _rawPreview:  detected === 'none' ? pdfText.slice(0, 4000) : undefined,
  })
}
