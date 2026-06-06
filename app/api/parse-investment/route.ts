import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Local, deterministic parser for single-document investment PDFs (FD / RD /
// NPS / LIC / Gold / Bond / ETF). No AI — text is extracted with unpdf and
// fields pulled with per-type regex heuristics. Returns DB-ready rows for the
// caller to review and insert. (Stocks & Mutual Funds use /api/parse-holdings.)

const INV_TABLES: Record<string, string> = {
  mutual_fund: 'mutual_funds', stock: 'stocks', fixed_deposit: 'fixed_deposits',
  recurring_deposit: 'recurring_deposits', nps: 'nps_accounts', lic: 'lic_policies',
  gold: 'gold_investments', bond: 'bond_investments', etf: 'etf_investments',
}

// ──── PDF text extraction (local, password-aware) ─────────────────────

async function extractText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdfDoc = await getDocumentProxy(bytes, password ? { password } : {}) as any
  let out = ''
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p)
    const tc   = await page.getTextContent()
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

// ──── field helpers ───────────────────────────────────────────────────

const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }

function num(s?: string | null): number | null {
  if (s == null) return null
  const n = parseFloat(String(s).replace(/,/g, '').replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? null : n
}

function toISO(d: string, m: string, y: string): string | null {
  const yyyy = y.length === 2 ? `20${y}` : y
  const mm   = /^\d+$/.test(m) ? m.padStart(2, '0') : MON[m.slice(0, 3).toLowerCase()]
  if (!mm) return null
  return `${yyyy}-${mm}-${d.padStart(2, '0')}`
}

// First amount that appears after a label
function amtAfter(text: string, labelRe: RegExp): number | null {
  const m = text.match(labelRe)
  if (!m || m.index == null) return null
  const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 70)
  return num(slice.match(/(?:rs\.?|inr|₹|aed)?\s*([\d,]+(?:\.\d+)?)/i)?.[1])
}

// First date that appears after a label
function dateAfter(text: string, labelRe: RegExp): string | null {
  const m = text.match(labelRe)
  if (!m || m.index == null) return null
  const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 45)
  const dm = slice.match(/(\d{1,2})[-\/\s.]([A-Za-z]{3,9}|\d{1,2})[-\/\s.](\d{2,4})/)
  return dm ? toISO(dm[1], dm[2], dm[3]) : null
}

function rateAfter(text: string, labelRe: RegExp): number | null {
  const m = text.match(labelRe)
  if (!m || m.index == null) return null
  const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 30)
  return num(slice.match(/([\d.]+)\s*%/)?.[1])
}

const BANK_RE = /\b(HDFC|ICICI|Axis|SBI|State Bank|Kotak|YES Bank|IndusInd|Bank of Baroda|PNB|Punjab National|Canara|Union Bank|IDFC|Bandhan|Federal Bank|RBL|AU Small|Bajaj|Emirates NBD|ADCB|FAB|Mashreq)\b/i
const bankOf = (t: string) => t.match(BANK_RE)?.[1] ?? null
const currencyOf = (t: string) => /\bAED\b|dirham/i.test(t) ? 'AED' : 'INR'

// Multi-row FD list/table (one row per deposit): columns Account No · Principal ·
// Maturity Amount · Maturity Date · Rate · Deposit Start Date. Each row is anchored
// on the long account number; we slice the text up to the next account number and
// pull the amounts/rate/dates from that window (robust to wrapped date cells).
function parseFdTable(text: string): any[] {
  if (!/principal\s*amount/i.test(text) || !/maturity/i.test(text)) return []
  const acctRe = /\b\d{11,17}\b/g
  const anchors: { idx: number; acct: string }[] = []
  let m: RegExpExecArray | null
  while ((m = acctRe.exec(text)) !== null) anchors.push({ idx: m.index, acct: m[0] })
  if (anchors.length < 2) return []   // a single FD is handled by the label parser

  const bank = bankOf(text)
  const out: any[] = []
  for (let i = 0; i < anchors.length; i++) {
    const win = text.slice(anchors[i].idx, i + 1 < anchors.length ? anchors[i + 1].idx : text.length)

    const amounts = Array.from(win.matchAll(/([\d,]+\.\d{2})\b/g)).map(a => parseFloat(a[1].replace(/,/g, '')))
    const large   = amounts.filter(a => a >= 1000)              // principal, maturity (+ totals on last row)
    const principal = large[0]
    if (principal == null) continue
    const maturity  = large[1] ?? null
    const rate      = amounts.find(a => a > 0 && a < 100) ?? null

    // Pair day-month tokens with year tokens in column order: [0]=Maturity Date, [1]=Deposit Start
    const dms = Array.from(win.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?/g)).map(x => ({ d: x[1], mon: x[2] }))
    const yrs = Array.from(win.matchAll(/\b(20\d{2})\b/g)).map(x => x[1])
    const dates: (string | null)[] = []
    for (let k = 0; k < Math.min(dms.length, yrs.length); k++) dates.push(toISO(dms[k].d, dms[k].mon, yrs[k]))

    const last4 = anchors[i].acct.slice(-4)
    out.push({
      name:          `Fixed Deposit ••${last4}`,
      bank_name:     bank,
      amount:        principal,
      current_value: maturity,
      interest_rate: rate,
      maturity_date: dates[0] ?? null,
      purchase_date: dates[1] ?? null,
      currency:      /\bAED\b/i.test(win) ? 'AED' : 'INR',
    })
  }
  return out
}

// Multi-row RD list/table: columns Account No · Start Date · Installment Amount ·
// Maturity Amount · Date of Maturity · Tenure · Rate · Current Principal.
// Decimal amounts appear in column order: [Installment, Maturity, Rate, CurrentPrincipal];
// dates are DD-Mon-YYYY → [Start Date, Date of Maturity].
function parseRdTable(text: string): any[] {
  if (!/installment\s*amount|recurring\s*deposit/i.test(text)) return []
  const acctRe = /\b\d{11,17}\b/g
  const anchors: { idx: number; acct: string }[] = []
  let m: RegExpExecArray | null
  while ((m = acctRe.exec(text)) !== null) anchors.push({ idx: m.index, acct: m[0] })
  if (anchors.length < 1) return []

  const bank = bankOf(text)
  const out: any[] = []
  for (let i = 0; i < anchors.length; i++) {
    const win = text.slice(anchors[i].idx, i + 1 < anchors.length ? anchors[i + 1].idx : text.length)
    const amounts = Array.from(win.matchAll(/([\d,]+\.\d{2})\b/g)).map(a => parseFloat(a[1].replace(/,/g, '')))
    if (amounts.length === 0) continue
    const big = amounts.filter(a => a >= 100)                     // money columns: Installment, Maturity, Current Principal
    const monthly  = big[0]
    if (monthly == null) continue
    const maturity = big[1] ?? null                              // Maturity Amount
    const currentPrincipal = big[2] ?? null                     // Current Principal Amount (accrued)
    const rate     = amounts.find(a => a > 0 && a < 100) ?? null

    const dates = Array.from(win.matchAll(/\b(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{4})\b/g)).map(x => toISO(x[1], x[2], x[3]))
    const start = dates[0] ?? null, matDate = dates[1] ?? null
    let tenure: number | null = null
    if (start && matDate) { const s = new Date(start), e = new Date(matDate); tenure = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) }

    const last4 = anchors[i].acct.slice(-4)
    out.push({
      name:          `Recurring Deposit ••${last4}`,
      bank_name:     bank,
      amount:        monthly,
      interest_rate: rate,
      tenure_months: tenure,
      purchase_date: start,
      maturity_date: matDate,
      current_value: maturity,
      current_principal: currentPrincipal,
      months_paid:   currentPrincipal != null && monthly > 0 ? Math.round(currentPrincipal / monthly) : null,
      currency:      /\bAED\b/i.test(win) ? 'AED' : 'INR',
    })
  }
  return out
}

// ──── per-type extractors → generic `inv` objects ─────────────────────

function extractInvestments(type: string, text: string): any[] {
  const currency = currencyOf(text)
  const bank = bankOf(text)

  switch (type) {
    case 'fixed_deposit': {
      const table = parseFdTable(text)          // multi-row FD list (e.g. HDFC FD summary)
      if (table.length > 0) return table
      const principal = amtAfter(text, /deposit\s*amount|principal\s*amount|amount\s*deposited|deposit\s*value|original\s*deposit(?:\s*amount)?|total\s*deposit(?:\s*amount)?|fd\s*amount|invested\s*amount|\bprincipal\b|amount\s*\(\s*(?:rs|inr|₹)/i)
        ?? amtAfter(text, /\bamount\b/i)
      if (principal == null) return []
      return [{
        name: bank ? `${bank} FD` : 'Fixed Deposit', bank_name: bank,
        amount: principal,
        interest_rate: rateAfter(text, /rate\s*of\s*interest|interest\s*rate|\broi\b|rate\s*\(/i),
        purchase_date: dateAfter(text, /deposit\s*date|value\s*date|booking\s*date|book(?:ed)?\s*(?:on|date)|open(?:ing)?\s*date|issue\s*date|date\s*of\s*deposit|start\s*date/i),
        maturity_date: dateAfter(text, /maturity\s*date|date\s*of\s*maturity|matures\s*on|maturity/i),
        current_value: amtAfter(text, /maturity\s*(?:value|amount)|amount\s*(?:on|at)\s*maturity|maturity\s*proceeds/i),
        currency,
      }]
    }
    case 'recurring_deposit': {
      const table = parseRdTable(text)          // multi-row RD list
      if (table.length > 0) return table
      const monthly = amtAfter(text, /monthly\s*(?:installment|instal?ment|deposit|amount|contribution)|installment\s*(?:amount|value)|instal?ment\s*amount|recurring\s*amount/i)
        ?? amtAfter(text, /\bamount\b/i)
      if (monthly == null) return []
      return [{
        name: bank ? `${bank} RD` : 'Recurring Deposit', bank_name: bank,
        amount: monthly,
        interest_rate: rateAfter(text, /rate\s*of\s*interest|interest\s*rate|\broi\b|rate\s*\(/i),
        purchase_date: dateAfter(text, /(?:start|open(?:ing)?|first\s*installment|account\s*open)\s*date|date\s*of\s*(?:opening|deposit)|booked\s*on/i),
        maturity_date: dateAfter(text, /maturity\s*date|date\s*of\s*maturity|matures\s*on/i),
        tenure_months: num(text.match(/(?:tenure|period|term)\D{0,12}(\d{1,3})\s*month/i)?.[1]),
        currency,
      }]
    }
    case 'nps': {
      const pran = text.match(/PRAN\D{0,10}(\d{12})/i)?.[1]
      const corpus = amtAfter(text, /total\s*(?:corpus|value|holding)|current\s*value|valuation|nav\s*amount|total\s*portfolio\s*value/i)
      if (!pran && corpus == null) return []
      return [{
        name: 'NPS Account', folio_number: pran ?? null,
        current_value: corpus, amount: amtAfter(text, /total\s*contribution|amount\s*contributed|total\s*invested/i),
        purchase_date: dateAfter(text, /date\s*of\s*(?:joining|registration)|registration\s*date/i),
        currency,
      }]
    }
    case 'lic': {
      const policyNo = text.match(/policy\s*(?:no|number|#)\D{0,8}(\d{6,12})/i)?.[1]
      const sumAssured = amtAfter(text, /sum\s*assured|basic\s*sum\s*assured/i)
      if (!policyNo && sumAssured == null) return []
      return [{
        name: text.match(/(?:plan|policy)\s*name\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .\-()]{3,40})/i)?.[1]?.trim() ?? 'LIC Policy',
        folio_number: policyNo ?? null,
        current_value: sumAssured,
        amount: amtAfter(text, /(?:annual|yearly|total)\s*premium|premium\s*amount/i),
        purchase_date: dateAfter(text, /date\s*of\s*commencement|commencement\s*date|start\s*date|issue\s*date/i),
        maturity_date: dateAfter(text, /maturity\s*date|date\s*of\s*maturity/i),
        currency,
      }]
    }
    case 'gold': {
      const amt = amtAfter(text, /invested\s*amount|purchase\s*(?:amount|value)|total\s*(?:amount|value)|amount\s*paid/i)
      if (amt == null) return []
      return [{
        name: 'Gold', amount: amt,
        units: num(text.match(/([\d,]+(?:\.\d+)?)\s*(?:gram|gm\b|gms|grm)/i)?.[1]),
        nav: amtAfter(text, /price\s*per\s*gram|rate\s*per\s*gram/i),
        fund_category: /sgb|sovereign/i.test(text) ? 'sgb' : /etf/i.test(text) ? 'gold_etf' : 'physical',
        purchase_date: dateAfter(text, /purchase\s*date|date\s*of\s*purchase|invoice\s*date/i),
        currency,
      }]
    }
    case 'bond': {
      const amt = amtAfter(text, /invested\s*amount|investment\s*amount|total\s*(?:amount|cost|value)|amount\s*paid/i)
      if (amt == null) return []
      return [{
        name: text.match(/([A-Za-z][A-Za-z0-9 .%\-]{6,45}?\bbond\b[A-Za-z0-9 .%\-]{0,20})/i)?.[1]?.trim() ?? 'Bond',
        amount: amt,
        nav: amtAfter(text, /face\s*value/i),
        units: num(text.match(/(?:quantity|units|no\.?\s*of\s*bonds)\D{0,8}(\d{1,6})/i)?.[1]),
        interest_rate: rateAfter(text, /coupon\s*rate|interest\s*rate/i),
        maturity_date: dateAfter(text, /maturity\s*date|redemption\s*date/i),
        purchase_date: dateAfter(text, /purchase\s*date|allotment\s*date|investment\s*date/i),
        fund_category: /tax[\s-]*free/i.test(text) ? 'tax_free' : /\brbi\b/i.test(text) ? 'rbi_bonds' : /corporate/i.test(text) ? 'corporate' : 'govt',
        currency,
      }]
    }
    case 'etf': {
      const units = num(text.match(/(?:units|quantity|shares)\D{0,8}([\d,]+(?:\.\d+)?)/i)?.[1])
      const price = amtAfter(text, /(?:avg|average)?\s*(?:buy|purchase)?\s*price|nav|rate/i)
      if (units == null || price == null) return []
      return [{
        name: text.match(/([A-Za-z][A-Za-z0-9 .&\-]{4,40}?\betf\b)/i)?.[1]?.trim() ?? 'ETF',
        symbol: text.match(/\b([A-Z]{3,12})\b\s*ETF/i)?.[1] ?? null,
        units, nav: price, amount: amtAfter(text, /invested|total\s*(?:amount|cost|value)/i),
        currency,
      }]
    }
    default:
      // Stocks / Mutual Funds: use the dedicated /api/parse-holdings importer
      return []
  }
}

// ──── DB row builder (matches actual table columns) ───────────────────

const oneOf = (v: any, allowed: string[], fb: string) => {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
  return allowed.includes(s) ? s : fb
}

function buildRow(type: string, inv: any): Record<string, any> | null {
  const currency = inv.currency === 'AED' ? 'AED' : 'INR'
  const country  = currency === 'AED' ? 'UAE' : 'India'
  const base     = { currency, country }
  switch (type) {
    case 'fixed_deposit': {
      const principal = num(inv.amount)
      if (!inv.name || principal == null) return null
      return { ...base, name: inv.name, bank_name: inv.bank_name ?? inv.name, principal,
        interest_rate: num(inv.interest_rate) ?? 0, start_date: inv.purchase_date ?? null,
        maturity_date: inv.maturity_date ?? null, maturity_amt: num(inv.current_value), is_active: true }
    }
    case 'recurring_deposit': {
      const monthly = num(inv.amount)
      if (!inv.name || monthly == null) return null
      return { ...base, name: inv.name, bank_name: inv.bank_name ?? inv.name, monthly_amount: monthly,
        interest_rate: num(inv.interest_rate) ?? 0, tenure_months: num(inv.tenure_months) ?? 12,
        start_date: inv.purchase_date ?? null, maturity_date: inv.maturity_date ?? null,
        current_amount: num(inv.current_principal), months_paid: num(inv.months_paid) }
    }
    case 'nps':
      return { ...base, name: inv.name ?? 'NPS Account', pran_number: inv.folio_number ?? null, tier: 'Tier I',
        corpus_amount: num(inv.current_value) ?? 0, invested_amount: num(inv.amount) ?? 0,
        equity_allocation: 50, corporate_bond_allocation: 30, govt_securities_allocation: 20,
        start_date: inv.purchase_date ?? null }
    case 'lic':
      return { ...base, name: inv.name ?? 'LIC Policy', policy_number: inv.folio_number ?? null, plan_name: inv.name ?? null,
        sum_assured: num(inv.current_value) ?? 0, annual_premium: num(inv.amount) ?? 0, premium_frequency: 'Annually',
        start_date: inv.purchase_date ?? null, maturity_date: inv.maturity_date ?? null, total_paid: num(inv.amount) ?? 0 }
    case 'gold': {
      const invested = num(inv.amount)
      if (invested == null) return null
      return { ...base, name: inv.name ?? 'Gold', gold_type: oneOf(inv.fund_category, ['physical', 'sgb', 'gold_etf', 'gold_mf'], 'physical'),
        quantity_grams: num(inv.units), buy_price_per_gram: num(inv.nav), invested_amount: invested, purchase_date: inv.purchase_date ?? null }
    }
    case 'bond': {
      const invested = num(inv.amount)
      if (invested == null) return null
      return { ...base, name: inv.name ?? 'Bond', bond_type: oneOf(inv.fund_category, ['govt', 'corporate', 'tax_free', 'rbi_bonds', 'sgb'], 'govt'),
        face_value: num(inv.nav) ?? 1000, quantity: num(inv.units) ?? 1, coupon_rate: num(inv.interest_rate),
        maturity_date: inv.maturity_date ?? null, invested_amount: invested, purchase_date: inv.purchase_date ?? null }
    }
    case 'etf': {
      const units = num(inv.units), avgBuy = num(inv.nav)
      if (units == null || avgBuy == null) return null
      return { ...base, etf_name: inv.name ?? 'ETF', symbol: inv.symbol ?? '', exchange: 'NSE',
        units, avg_buy_price: avgBuy, etf_type: 'equity', invested_amount: num(inv.amount) ?? units * avgBuy, purchase_date: inv.purchase_date ?? null }
    }
    default:
      return null
  }
}

// ──── handler ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file') as File
  const invType  = (formData.get('investmentType') as string) ?? 'fixed_deposit'
  const password = (formData.get('password') as string | null) || undefined

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!INV_TABLES[invType]) return NextResponse.json({ error: `Unsupported type: ${invType}` }, { status: 400 })
  if (invType === 'stock' || invType === 'mutual_fund') {
    return NextResponse.json({ error: 'For stocks & mutual funds, use the Import PDF button on those pages.' }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  let text: string
  try {
    text = await extractText(bytes, password)
  } catch (err: any) {
    const name = err?.name ?? '', code = err?.code, msg = (err?.message ?? '').toLowerCase()
    if (name === 'PasswordException' || msg.includes('password') || msg.includes('encrypt')) {
      if (code === 2 || (password && (msg.includes('incorrect') || msg.includes('wrong')))) {
        return NextResponse.json({ wrongPassword: true, error: 'Incorrect password. Please try again.' }, { status: 400 })
      }
      return NextResponse.json({ encrypted: true, hint: 'Usually your date of birth (DDMMYYYY) or customer ID.' })
    }
    return NextResponse.json({ error: 'Failed to read PDF', details: err.message }, { status: 500 })
  }

  if (!text?.trim()) {
    return NextResponse.json({ error: 'No text found — this looks like a scanned image. Please add it manually.' }, { status: 400 })
  }

  const rows = extractInvestments(invType, text).map(inv => buildRow(invType, inv)).filter((r): r is Record<string, any> => r !== null)

  return NextResponse.json({
    success: true,
    count: rows.length,
    investments: rows,
    preview: rows.slice(0, 5),
    parseWarning: rows.length === 0 ? "Couldn't read the key fields automatically. Copy the extracted text below and share it so this layout can be supported — or add the investment manually." : undefined,
    _rawPreview: rows.length === 0 ? text.slice(0, 3500) : undefined,
  })
}
