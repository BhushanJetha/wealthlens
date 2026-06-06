import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BANK_HINTS: Record<string, string> = {
  'HDFC':               'Customer ID or Date of birth — DDMMYYYY',
  'ICICI':              'Date of birth — DDMMYYYY',
  'Axis':               'Date of birth — DDMMYYYY',
  'SBI':                'Account number (last 6 digits) or Date of birth',
  'Kotak':              'Date of birth — DDMMYYYY or Customer ID',
  'YES Bank':           'Date of birth — DDMMYYYY',
  'IndusInd':           'Date of birth — DDMMYYYY',
  'Emirates NBD':       'Date of birth — DDMMYYYY or last 4 digits of account',
  'ADCB':               'Last 4 digits of your account number',
  'FAB':                'Date of birth — DDMMYYYY',
  'Wio Bank':           'Date of birth — DDMMYYYY or 6-digit PIN',
}

function detectBank(filename: string, hint?: string | null): string | null {
  if (hint && BANK_HINTS[hint]) return hint
  const n = filename.toLowerCase()
  if (n.includes('wio'))                                  return 'Wio Bank'
  if (n.includes('hdfc'))                                 return 'HDFC'
  if (n.includes('icici'))                                return 'ICICI'
  if (n.includes('axis'))                                 return 'Axis'
  if (n.includes('sbi'))                                  return 'SBI'
  if (n.includes('kotak'))                                return 'Kotak'
  if (n.includes('yes'))                                  return 'YES Bank'
  if (n.includes('indusind'))                             return 'IndusInd'
  if (n.includes('emirates') || n.includes('enbd'))       return 'Emirates NBD'
  if (n.includes('adcb'))                                 return 'ADCB'
  if (n.includes('fab') || n.includes('first abu dhabi')) return 'FAB'
  return null
}

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
      if (isNaN(lastY) || Math.abs(item.y - lastY) > 3) {
        rowKey = Math.round(item.y); lastY = item.y
      }
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, [])
      rowMap.get(rowKey)!.push({ x: item.x, str: item.str })
    }

    const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const cells = rowMap.get(y)!.sort((a, b) => a.x - b.x)
      const line  = cells.map(c => c.str).join(' ').trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

const MONTH_MAP: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
}

function toISODate(raw: string, defaultYear?: number): string | null {
  const s = raw.trim()
  const year = defaultYear ?? new Date().getFullYear()

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }

  // DD Mon YYYY or DD Mon, YYYY
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{2,4})$/)
  if (m) {
    const y  = m[3].length === 2 ? `20${m[3]}` : m[3]
    const mo = MONTH_MAP[m[2].slice(0,3).toLowerCase()] ?? '01'
    return `${y}-${mo}-${m[1].padStart(2,'0')}`
  }

  // DD/MM (no year)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2])
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12)
      return `${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }
  return null
}

// ── Categorisation ────────────────────────────────────────────────────

const CAT_RULES: [RegExp, string][] = [
  // Credit card bill payments — separate from international transfers
  [/credit\s+repayment(?:\s+autopay)?|cc\s+(?:bill|payment)|card\s+(?:bill\s+)?repayment|enbd\s+cc|autopay(?:\s+(?:credit|card))?|credit\s+card\s+(?:bill|payment)|amex\s+payment|mastercard\s+payment|visa\s+payment/i, 'Credit Card Payment'],
  // Remittance / money exchange — must come before Shopping (LULU clash)
  [/lulu\s+international\s+exchange|al\s+ansari\s+exchange|western\s+union|money\s*gram|international\s+exchange\s+llc|forex\s+(?:center|transfer|bureau)|remittance|money\s+transfer\s+(?:llc|co)/i, 'Transfer'],
  // Food
  [/swiggy|zomato|uber\s*eat|talabat|deliveroo|keet\b|noon\s*food|carriage\b|hunger\s*station|blinkit|zepto|dunzo|bigbasket|restaurant|restaur[ae]?nt?|caf[eé]|mcdonald|kfc|pizza|domino|starbucks|dunkin|subway|burger|sushi|biryani|bakery|canteen|dining|eatery|kitchen|diner|grill|shawarma|falafel|bistro|food(?!stuff)/i, 'Food'],
  [/uber(?!\s*eat)|\bola\b|rapido|metro\b|auto\b|cab\b|taxi\b|rickshaw|redbus|careem|transport/i, 'Transport'],
  [/irctc|makemytrip|cleartrip|goibibo|easemytrip|yatra|\bhotel\b|airbnb|\boyo\b|booking\.com|agoda|marriott|flight|airline|air\s*india|indigo|spicejet|vistara|airport|resort/i, 'Travel'],
  [/netflix|hotstar|disney|prime\s*video|amazon\s*prime|zee5|sonyliv|youtube\s*prem|apple\s*tv|spotify|gaana|apple\s*music|bookmyshow|\bpvr\b|\binox\b/i, 'Subscription'],
  [/electricity|bescom|msedcl|tata\s*power|water\s*board|\bgas\b|airtel|\bjio\b|vodafone|\bvi\b|bsnl|postpaid|prepaid|broadband|wifi|etisalat|\bdu\b|telecom/i, 'Utilities'],
  [/apollo|pharmeasy|netmeds|medplus|1mg|doctor|hospital|clinic|pharmacy|\bmed\b|diagnostic|dental|spa\b|wellness|fitness|gym\b/i, 'Health'],
  [/snooker|bowling|cinema|movie|concert|gaming|arcade/i, 'Entertainment'],
  // Shopping — lulu alone (hypermarket), but NOT lulu international exchange (already caught above)
  [/amazon(?!\s*prime)|flipkart|myntra|ajio|nykaa|reliance\s*digital|croma|d[\s\-]?mart|big\s*bazaar|supermarket|hypermarket|carrefour|(?<!international\s)lulu\b|spinneys|\bmart\b|\bmarket\b/i, 'Shopping'],
  [/byju|coursera|udemy|upgrad|vedantu|school\s*fee|tuition|coaching|exam\s*fee/i, 'Education'],
  [/zerodha|groww|upstox|mutual\s*fund|\bsip\b|\bppf\b|\bnps\b|\blic\b|sbi\s*life|hdfc\s*life|insurance|policy\s*prem/i, 'Investment'],
  // Loan on Card — ENBD LOC/DAC transit, line-of-credit payments
  [/\bloc\s+and\s+dac\b|loc\s+transit|dac\s+transit|line\s+of\s+credit\s+(?:payment|debit)|loc\s+(?:debit|payment)|loan\s+on\s+card/i, 'Loan on Card'],
  [/\bemi\b|loan\s*inst|mortgage|\bnach\b|\bmandate\b|\becs\b/i, 'EMI/Loan'],
  // NRE/NRO inter-account and UAE→India direct transfers
  [/\bnro\s+to\s+nre\b|\bnre\s+to\s+nro\b|\b(?:nro|nre)\s+account\b/i, 'Transfer'],
  [/\buae\s+to\s+(?:india|in)\b|outward\s+remittance|\bswift\s+(?:transfer|payment)\b/i, 'Transfer'],
  [/neft|rtgs|imps|fund\s*trans|wire\s*trans|\btransfer\b/i, 'Transfer'],
  [/salary|sal\b|payroll|stipend|wage\s*protection|wps\b/i, 'Salary'],
]

function categorize(text: string): string {
  for (const [re, cat] of CAT_RULES) if (re.test(text)) return cat
  return 'Other'
}

const CITY_SUFFIX = /(abu\s*dhabi|abudhabi|al\s+ain|dubai|sharjah|ajman|fujairah|mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata)\s*$/i

function cleanMerchant(raw: string): string {
  let s = raw
    .replace(/^(to|from)\s+/i, '')  // strip leading "To " / "From "
    .replace(/\b\d{8,}\b/g, '')
    .replace(CITY_SUFFIX, '')
    .replace(CITY_SUFFIX, '')
    .replace(/[*#|\\]{1,}/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return s.split(' ').filter(Boolean)
    .map(w => w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ').trim()
}

// ── Saving Spaces / Fixed Deposits ────────────────────────────────────

export interface ParsedFD {
  name:            string
  principal:       number
  interest_rate:   number
  start_date:      string
  maturity_date:   string
  maturity_amt:    number | null
  duration_months: number | null
  currency:        string
  is_active:       boolean
  confirmed:       boolean
}

// Date regex used in FD parsing
const FD_DATE_SRC = '(\\d{4}[\/\\-]\\d{1,2}[\/\\-]\\d{1,2}|\\d{1,2}[\/\\-]\\d{1,2}[\/\\-]\\d{2,4}|\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\\s+\\d{2,4})'

function detectSavingSpaces(text: string, bankName: string | null, inferredYear: number): ParsedFD[] {
  const currency = /\bAED\b/i.test(text) ? 'AED' : 'INR'
  const today    = new Date().toISOString().slice(0, 10)
  const seen      = new Set<string>()
  const spaces: ParsedFD[] = []

  function addIfNew(entry: Omit<ParsedFD, 'currency' | 'confirmed'> | null) {
    if (!entry) return
    if (isNaN(entry.principal) || entry.principal < 0) return
    const key = `${Math.round(entry.principal)}|${entry.start_date}|${entry.interest_rate}`
    if (seen.has(key)) return
    seen.add(key)
    spaces.push({ ...entry, currency, confirmed: true })
  }

  // ── Wio Bank: "Summary of Savings" table row parser ──────────────────
  // Format: "Account Name   1234567890   3.25%   DD/MM/YYYY   [DD/MM/YYYY]   Balance [AED]"
  function parseWioSavingsRow(line: string): Omit<ParsedFD, 'currency' | 'confirmed'> | null {
    // Must have a 9–12 digit account number (the key Wio identifier)
    const acctMatch = line.match(/\b(\d{9,12})\b/)
    if (!acctMatch) return null

    const acctIdx = acctMatch.index!
    // Name is everything before the account number
    const name = line.slice(0, acctIdx)
      .replace(/\s+/g, ' ')
      .replace(/[^a-zA-Z\s]/g, '').trim()
    if (name.length < 2) return null

    const rest = line.slice(acctIdx + acctMatch[0].length)

    // Interest rate
    const rateMatch = rest.match(/([\d.]+)\s*%/)
    const rate      = rateMatch ? parseFloat(rateMatch[1]) : 0

    // Dates: opened + optional closure
    const dateMatches = Array.from(rest.matchAll(new RegExp(FD_DATE_SRC, 'gi')))
    const startDate   = dateMatches[0] ? toISODate(dateMatches[0][1].trim(), inferredYear) : null
    const endDate     = dateMatches[1] ? toISODate(dateMatches[1][1].trim(), inferredYear) : null
    if (!startDate) return null

    // Balance: last number at end of line (may be integer like "5,000" or decimal "5,040.28")
    // Also handles "0 AED"
    const balMatch = line.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:AED|USD|INR)?\s*$/)
    const balance   = balMatch ? parseFloat(balMatch[1].replace(/,/g, '')) : 0

    const finalEnd  = endDate ?? new Date(new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)).toISOString().slice(0, 10)

    let durationMonths: number | null = null
    if (endDate) {
      durationMonths = Math.round(
        (new Date(finalEnd).getTime() - new Date(startDate).getTime()) / (30 * 24 * 60 * 60 * 1000)
      )
    }

    return {
      name:            name || 'Fixed Saving Space',
      principal:       balance,
      interest_rate:   rate,
      start_date:      startDate,
      maturity_date:   finalEnd,
      maturity_amt:    null,
      duration_months: durationMonths,
      is_active:       balance > 0 && finalEnd >= today,
    }
  }

  // ── Generic labeled-block parser (label: value look-ahead 250 chars) ─
  function findAmt(src: string, re: RegExp): number | null {
    const m = src.match(re)
    if (!m) return null
    const slice = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 250)
    const a = slice.match(/([\d,]+\.\d{2})/)
    if (!a) return null
    const n = parseFloat(a[1].replace(/,/g, ''))
    return isNaN(n) || n <= 0 ? null : n
  }
  function findDate(src: string, re: RegExp): string | null {
    const m = src.match(re)
    if (!m) return null
    const slice = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 150)
    const d = slice.match(new RegExp(FD_DATE_SRC, 'i'))
    return d ? toISODate(d[1].trim(), inferredYear) : null
  }
  function findRate(src: string, re: RegExp): number | null {
    const m = src.match(re)
    if (!m) return null
    const slice = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 100)
    const r = slice.match(/([\d.]+)\s*%/)
    return r ? parseFloat(r[1]) : null
  }

  function parseLabeledBlock(block: string): Omit<ParsedFD, 'currency' | 'confirmed'> | null {
    const principal =
      findAmt(block, /(?:balance|amount|deposited|principal|space\s*balance|current\s*balance|saving(?:s)?\s*(?:amount|balance)|closing\s*balance)\s*[:\-\(]?/i) ??
      (() => { const m = block.match(/([\d,]+\.\d{2})/); if (!m) return null; const n = parseFloat(m[1].replace(/,/g,'')); return n > 100 ? n : null })()

    if (!principal || principal <= 0) return null

    const rate = findRate(block, /(?:annual\s*(?:profit|interest)\s*rate|profit\s*rate|interest\s*rate|apy|rate|p\.a\.?)\s*[:\-]?/i)
      ?? (() => { const m = block.match(/([\d.]+)\s*%/); return m ? parseFloat(m[1]) : null })()

    const startDate = findDate(block, /(?:start\s*date|open(?:ing|ed)?\s*date?|from\s*date|created|placed\s*on|opened|account\s*opened)\s*[:\-]?/i)
    const endDate   = findDate(block, /(?:end\s*date|maturity\s*date|close\s*date|expiry|matures?\s*(?:on|date)?|account\s*closure|closing\s*date)\s*[:\-]?/i)

    if (!startDate && !endDate) return null
    const finalStart = startDate ?? new Date().toISOString().slice(0, 10)
    const finalEnd   = endDate   ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)

    const maturityAmt = findAmt(block, /(?:expected\s*(?:profit\s*at\s*)?maturity(?:\s*amount)?|maturity\s*(?:amount|value)|total\s*at\s*maturity|amount\s*at\s*maturity)\s*[:\-]?/i)

    let durationMonths: number | null = null
    const dur = block.match(/(?:duration|tenure|term|period)\s*[:\-]?\s*(\d+)\s*(months?|days?|years?)/i)
    if (dur) {
      const n = parseInt(dur[1]), u = dur[2].toLowerCase()
      durationMonths = u.startsWith('year') ? n * 12 : u.startsWith('day') ? Math.round(n / 30) : n
    } else if (startDate && endDate) {
      durationMonths = Math.round((new Date(finalEnd).getTime() - new Date(finalStart).getTime()) / (30 * 24 * 60 * 60 * 1000))
    }

    let name = 'Saving Space'
    const nm = block.match(/(?:space\s*(?:name|:)|account\s*(?:name|:)|name\s*[:\-]|goal\s*(?:name|:))\s*([^\n\r:]{2,60})/i)
      ?? block.match(/"([^"]{2,60})"/)
    if (nm) { const c = nm[1].trim(); if (c.length >= 2 && c.length <= 60) name = c }

    return { name, principal, interest_rate: rate ?? 0, start_date: finalStart, maturity_date: finalEnd, maturity_amt: maturityAmt ?? null, duration_months: durationMonths, is_active: finalEnd >= today }
  }

  // ── Scan section windows ──────────────────────────────────────────────
  // Wio uses "Summary of Savings"; others may use "Saving Spaces" / "Fixed Deposit"
  const sectionRe = /summary\s+of\s+savings|saving\s*spaces?\b|savings?\s*goal|smart\s*sav(?:er|ings)|term\s*deposit|fixed\s*deposit/gi
  let sectionMatch: RegExpExecArray | null
  const processedRanges: Array<[number, number]> = []

  while ((sectionMatch = sectionRe.exec(text)) !== null) {
    const start   = sectionMatch.index
    if (processedRanges.some(([s, e]) => start >= s && start <= e)) continue

    const windowEnd = Math.min(start + 4000, text.length)
    const window    = text.slice(start, windowEnd)
    processedRanges.push([start, windowEnd])

    const HEADER_LINE = /^(name|space|balance|rate|start|end|date|amount|profit|currency|aed|inr|type|tenure|status|account\s*name|interest\s*rate|account\s*number|closing\s*balance|account\s*opened|account\s*closure)\s*$/i

    for (const rawLine of window.split('\n')) {
      const line = rawLine.trim()
      if (line.length < 8) continue
      if (HEADER_LINE.test(line)) continue

      // Try Wio-specific (10-digit account number) first
      const wioEntry = parseWioSavingsRow(line)
      if (wioEntry) { addIfNew(wioEntry); continue }

      // Fallback: labeled block from multi-line context
    }

    // Also try labeled block parsing across blank-line separated blocks
    for (const block of window.split(/\n{2,}/)) {
      if (block.trim().length < 20) continue
      addIfNew(parseLabeledBlock(block))
    }
    addIfNew(parseLabeledBlock(window))
  }

  // ── Also scan for labeled FD detail pages (ACCOUNT TYPE FIXED_DEPOSIT) ─
  const fdDetailRe = /FIXED_DEPOSIT|ACCOUNT\s+TYPE[\s\S]{0,30}FIXED/gi
  let fdMatch: RegExpExecArray | null
  while ((fdMatch = fdDetailRe.exec(text)) !== null) {
    const start   = fdMatch.index
    const window  = text.slice(start, Math.min(start + 2000, text.length))
    addIfNew(parseLabeledBlock(window))
  }

  return spaces
}

// ── Statement metadata ────────────────────────────────────────────────

function detectMeta(text: string, bankName: string | null) {
  const currency = /\bAED\b|UAE\s*Dirham|درهم/i.test(text) ? 'AED' : 'INR'
  const is_wio   = !!(bankName?.toLowerCase().includes('wio') || /\bwio\s*bank\b|\bwio\b/i.test(text.slice(0, 3000)))

  const acct4 =
    text.match(/(?:a\/?c\s*(?:no|number|num)?|account\s*(?:no|number|num)?)\s*[.:\-]?\s*[xX*\d\s]{6,}(\d{4})/i)?.[1] ??
    text.match(/\b\d{6,}(\d{4})\b/)?.[1] ?? null

  const account_type: 'savings' | 'current' = /current\s*account|c\.?a\.?\b/i.test(text) ? 'current' : 'savings'

  const BANK_RE = /\b(Wio(?:\s*Bank)?|HDFC(?:\s*Bank)?|ICICI(?:\s*Bank)?|Axis\s*Bank|SBI(?:\s*Bank)?|Kotak(?:\s*Mahindra(?:\s*Bank)?)?|YES\s*Bank|IndusInd(?:\s*Bank)?|Emirates\s*NBD|ENBD|ADCB|FAB|First\s*Abu\s*Dhabi|Mashreq|RAK\s*Bank|RAKBANK|Standard\s*Chartered|HSBC|Citi(?:bank)?|RBL(?:\s*Bank)?|AU\s*(?:Small\s*Finance\s*)?Bank|Federal\s*Bank|Union\s*Bank|Punjab\s*National|Canara\s*Bank|Bank\s*of\s*Baroda|IDFC(?:\s*First)?|Bandhan\s*Bank)\b/i
  const bankMatch = text.slice(0, 3000).match(BANK_RE) ?? text.match(BANK_RE)
  const bank_name = bankMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? bankName

  const periodMatch = text.match(/(?:statement\s*(?:period|date\s*range)|from|period)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|–|-)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
  const period_from = periodMatch ? toISODate(periodMatch[1]) : null
  const period_to   = periodMatch ? toISODate(periodMatch[2]) : null

  const yearMatch    = text.match(/\b(20\d{2})\b/)
  const inferredYear = yearMatch ? parseInt(yearMatch[1]) : period_from ? parseInt(period_from.slice(0,4)) : new Date().getFullYear()

  function findAmt(re: RegExp): number | null {
    const m = text.match(re)
    if (!m || m.index === undefined) return null
    const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 200)
    const a = slice.match(/([\d,]+\.\d{2})/)
    if (!a) return null
    const n = parseFloat(a[1].replace(/,/g, ''))
    return isNaN(n) || n < 0 ? null : n
  }
  const closing_balance = findAmt(/closing\s*balance|closing\s*bal|available\s*balance|available\s*bal/i)

  return { currency, account_last4: acct4, account_type, bank_name, period_from, period_to, inferredYear, closing_balance, is_wio }
}

// ── Transaction parser ────────────────────────────────────────────────

// Standard date pattern (includes YYYY-MM-DD)
const DATE_PAT = '(\\d{4}[\\-\\/]\\d{1,2}[\\-\\/]\\d{1,2}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\\.?\\s+\\d{2,4}|\\d{1,2}[\\/\\-]\\d{1,2}(?![\\/\\-\\d]))'

// Standard unsigned decimal (for non-Wio banks)
const AMT_PAT = '([0-9]{1,3}(?:,[0-9]{2,3})*\\.[0-9]{2})'

// Wio amount: signed integer or decimal  (-14,000 / 26,800 / -170.95)
// Matches: -14,000  |  26,800  |  -170.95  |  5,040.28  |  100
const WIO_NUM = '([\\-\\+]?\\d{1,3}(?:,\\d{3})*(?:\\.\\d{1,2})?)'

const SKIP_LINE = /^(date\b|sl\b|sr\b|no\b|description|narration|particulars|transaction\s*(date|details)|value\s*date|withdrawal|deposit|debit|credit|balance\b|opening|closing|total\b|statement|account|page\s*\d|chq|ref(?:erence)?|ref\.\s*number|amount\s*\(incl|incl\.\s*vat)\s*$/i

// Income signals
const INCOME_PAT = /\b(salary|sal\b|payroll|stipend|credited\s*by|cr\s*by|by\s*(?:neft|imps|rtgs|upi)|received\s*from|refund|cashback|interest\s*cr(?:edit)?|interest\s*applied\s*from|interest\s*credit\b|saving\s*space\s*profit|profit\s*(?:credit|earned)|dividend|pension|bonus\s*cr|maturity\s*(?:proceeds|amount)|wage\s*protection|\bwps\b|incoming\s*transfer|money\s*received|top[\s\-]?up\s*(?:received|from)|transfer\s*(?:in|received)|bank\s*transfer\s*in|amount\s*credited|\bcredited\b|credit\s*(?:from|received)|deposit\s*(?:from|by|received)|\bdeposited\b|inward|inbound|remittance\s*(?:in|received)|funds?\s*received|payment\s*received|from\s+loc\b|from\s+\w+\s+transit|from\s+\w+\s+account)\b/i

const REFUND_PAT = /\b(refund|reversal|reversed|cashback|cash\s*back|chargeback|credit\s*adj)\b/i

// Skip Wio internal saving-space fund movements (but NOT interest income)
const WIO_SPACE_SKIP = /\bto\s+fixed\s+saving\s+space\b|fixed\s+saving\s+space\s+to\s+[a-z]/i

function parseTransactions(text: string, inferredYear: number, isWio: boolean): any[] {
  const lines        = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 5)
  const results: any[] = []
  let prevBalance: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SKIP_LINE.test(line)) continue

    // ── Wio Bank specific path ────────────────────────────────────────
    if (isWio) {
      // Pre-process: strip (rate: X.XXXX) and Wio ref numbers (Pxxxxxxxxx)
      const proc = line
        .replace(/\(rate:\s*[\d.]+\)/gi, '')
        .replace(/\bP\d{8,12}\b/g, '')
        .replace(/\s+/g, ' ').trim()

      // Skip "Summary of Savings" table rows — they have a 10-digit savings account number.
      // After stripping the P-prefixed ref number above, any remaining 9+ digit number
      // is a savings account number (e.g. 2705253430), not a transaction.
      if (/\b\d{9,}\b/.test(proc)) continue

      // Must start with a recognisable date
      const dateRe    = new RegExp(DATE_PAT, 'i')
      const dateMatch = proc.match(dateRe)
      if (!dateMatch) continue

      const isoDate = toISODate(dateMatch[1].trim(), inferredYear)
      if (!isoDate) continue

      const afterDate = proc.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim()

      // Skip saving-space internal fund transfers
      if (WIO_SPACE_SKIP.test(afterDate)) continue

      // Find all numbers in afterDate (signed ints or decimals)
      const numRe  = new RegExp(WIO_NUM, 'g')
      const nums   = Array.from(afterDate.matchAll(numRe)).filter(m => {
        const raw = m[1].replace(/,/g, '').replace(/^[+-]/, '')
        const n   = parseFloat(raw)
        return !isNaN(n) && n >= 1  // exclude noise like "0" or sub-cent values
      })

      if (nums.length < 2) continue

      // Last number = running balance; second-to-last = transaction amount
      const balRaw  = nums[nums.length - 1][1].replace(/,/g, '')
      const txnM    = nums[nums.length - 2]
      const txnRaw  = txnM[1].replace(/,/g, '')
      const amount  = Math.abs(parseFloat(txnRaw))

      if (!amount || amount <= 0 || amount > 50_000_000) continue

      // Balance tracking
      const currentBalance = parseFloat(balRaw)
      const isCrBalance    = prevBalance !== null && !isNaN(currentBalance) && currentBalance > prevBalance + 0.01
      if (!isNaN(currentBalance)) prevBalance = currentBalance

      // Merchant = text before the txn amount position
      const txnPos  = (txnM.index ?? 0)
      let merchant  = afterDate.slice(0, txnPos).replace(/\s+/g, ' ').trim()
      // Clean trailing currency symbols and noise
      merchant = merchant.replace(/\b(AED|USD|INR|₹)\b/gi, '').replace(/\s+/g, ' ').trim()

      if (!merchant || merchant.length < 2) continue

      const hasNegSign = txnRaw.startsWith('-')
      const isCr       = !hasNegSign || INCOME_PAT.test(merchant) || isCrBalance

      const cleaned = cleanMerchant(merchant)
      if (!cleaned || cleaned.length < 2) continue

      results.push(buildTxn(isoDate, cleaned, merchant, amount, isCr, proc))
      continue
    }

    // ── Standard path for all other banks ────────────────────────────
    const dateMatches = Array.from(line.matchAll(new RegExp(DATE_PAT, 'gi')))
    if (dateMatches.length === 0) continue

    const firstDate = dateMatches[0]
    const isoDate   = toISODate(firstDate[1].trim(), inferredYear)
    if (!isoDate) continue

    let amountMatches = Array.from(line.matchAll(new RegExp(AMT_PAT, 'g')))
    if (amountMatches.length === 0 && i + 1 < lines.length) {
      const next = lines[i + 1]
      if (!new RegExp(DATE_PAT, 'i').test(next))
        amountMatches = Array.from(next.matchAll(new RegExp(AMT_PAT, 'g')))
    }
    if (amountMatches.length === 0) continue

    let txnAmtMatch: RegExpMatchArray
    let isDepositCol = false

    if (amountMatches.length >= 3) {
      const a1 = parseFloat(amountMatches[0][1].replace(/,/g, ''))
      const a2 = parseFloat(amountMatches[1][1].replace(/,/g, ''))
      if (a1 > 0) { txnAmtMatch = amountMatches[0] }
      else        { txnAmtMatch = amountMatches[1]; isDepositCol = true }
    } else {
      txnAmtMatch = amountMatches[0]
    }

    const amount = parseFloat(txnAmtMatch[1].replace(/,/g, ''))
    if (!amount || amount <= 0 || amount > 50_000_000) continue

    const afterAmt  = line.slice((txnAmtMatch.index ?? 0) + txnAmtMatch[0].length, (txnAmtMatch.index ?? 0) + txnAmtMatch[0].length + 15)
    const isCrLabel = /\bCr\.?\b|CR\b/i.test(afterAmt)

    // Balance tracking for standard path too
    const lastAmt        = amountMatches[amountMatches.length - 1]
    const currentBalance = amountMatches.length >= 2 ? parseFloat(lastAmt[1].replace(/,/g, '')) : null
    let isCrByBalance    = false
    if (prevBalance !== null && currentBalance !== null) {
      isCrByBalance = currentBalance > prevBalance + 0.01
    }
    if (currentBalance !== null) prevBalance = currentBalance

    const dateEnd     = (firstDate.index ?? 0) + firstDate[0].length
    const firstAmtIdx = amountMatches[0].index ?? line.length
    let merchant      = line.slice(dateEnd, firstAmtIdx)
      .replace(new RegExp('^' + DATE_PAT, 'i'), '')
      .replace(/\b\d{10,}\b/g, '')
      .replace(/\b(USD|EUR|GBP|AED|INR|SAR)\b/gi, '')
      .replace(/\s+/g, ' ').trim()

    if (!merchant || merchant.length < 2) continue

    const isCr    = isCrLabel || isDepositCol || isCrByBalance || INCOME_PAT.test(merchant) || INCOME_PAT.test(line)
    const cleaned = cleanMerchant(merchant)
    if (!cleaned || cleaned.length < 2) continue

    results.push(buildTxn(isoDate, cleaned, merchant, amount, isCr, line))
  }

  const seen = new Set<string>()
  return results.filter(t => {
    const key = `${t.date}|${t.merchant}|${t.amount}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
}

function buildTxn(date: string, cleaned: string, merchant: string, amount: number, isCr: boolean, line: string) {
  let txn_type: string
  let category: string
  if (isCr) {
    if (/salary|sal\b|payroll|stipend|wage\s*protection|\bwps\b/i.test(cleaned + ' ' + line)) {
      txn_type = 'income'; category = 'Salary'
    } else if (REFUND_PAT.test(cleaned) || REFUND_PAT.test(line)) {
      txn_type = 'income'; category = 'Refund'
    } else if (/profit|interest\s*cr|interest\s*applied|interest\s*credit|saving\s*space\s*profit/i.test(cleaned + ' ' + line)) {
      txn_type = 'income'; category = 'Investment'
    } else if (/\bloc\s+and\s+dac\b|loc\s+transit|dac\s+transit|line\s+of\s+credit/i.test(cleaned + ' ' + line)) {
      // Credit from LOC/DAC = loan disbursement (draw-down on line of credit, money received)
      txn_type = 'transfer'; category = 'Loan Received'
    } else {
      txn_type = 'income'; category = categorize(cleaned)
    }
  } else {
    category = categorize(cleaned)
    txn_type = (category === 'Transfer' || category === 'Family Transfer') ? 'transfer'
             : (category === 'Loan on Card' || category === 'EMI/Loan') ? 'loan'
             : 'expense'
  }
  return { date, merchant: cleaned, description: merchant.trim(), amount, txn_type, category }
}

// ── API handler ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file') as File
  const password = (formData.get('password') as string | null) || undefined
  const bankHint = formData.get('bankHint') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes        = new Uint8Array(await file.arrayBuffer())
  const detectedBank = detectBank(file.name, bankHint)

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
      const hint = detectedBank ? BANK_HINTS[detectedBank] : null
      return NextResponse.json({
        encrypted: true,
        bank:      detectedBank,
        hint:      hint ?? 'Usually your Customer ID or date of birth in DDMMYYYY format',
      })
    }
    return NextResponse.json({ error: 'Failed to read PDF', details: err.message }, { status: 500 })
  }

  if (!pdfText?.trim()) {
    return NextResponse.json({
      error: 'No text found in this PDF. It may be a scanned image — try the Bill / Image option instead.',
    }, { status: 400 })
  }

  const meta = detectMeta(pdfText, detectedBank)

  // For Wio: individual FD sub-account pages start after "FIXED_DEPOSIT" marker.
  // We only want to parse transactions from the main account section.
  const txnText = meta.is_wio
    ? (pdfText.split(/\bFIXED_DEPOSIT\b/)[0] ?? pdfText)
    : pdfText

  const transactions  = parseTransactions(txnText, meta.inferredYear, meta.is_wio)
  const saving_spaces =
    (meta.is_wio || /summary\s+of\s+savings|saving\s*space|fixed\s*deposit/i.test(pdfText))
      ? detectSavingSpaces(pdfText, meta.bank_name, meta.inferredYear)
      : []

  const parseWarning = transactions.length < 2
    ? "Very few transactions were detected. Your bank's PDF layout may need manual review."
    : undefined

  return NextResponse.json({
    success:         true,
    bank_name:       meta.bank_name ?? detectedBank ?? 'Bank Account',
    account_last4:   meta.account_last4,
    account_type:    meta.account_type,
    currency:        meta.currency,
    period:          { from: meta.period_from, to: meta.period_to },
    closing_balance: meta.closing_balance,
    is_wio:          meta.is_wio,
    saving_spaces,
    transactions,
    parseWarning,
    _rawPreview:     pdfText.slice(0, 4000),
  })
}
