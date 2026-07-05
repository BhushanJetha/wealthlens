import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ──── Bank hints ──────────────────────────────────────────────────────

const BANK_HINTS: Record<string, string> = {
  'HDFC':         'Date of birth — DDMMYYYY (e.g. 15021990)',
  'ICICI':        'Date of birth — DDMMYYYY (e.g. 15021990)',
  'Axis':         'Date of birth — DDMMYYYY (e.g. 15021990)',
  'SBI':          'Date of birth — DDMMYYYY',
  'Kotak':        'Date of birth — DDMMYYYY',
  'YES Bank':     'Date of birth — DDMMYYYY',
  'IndusInd':     'Date of birth — DDMMYYYY',
  'AmEx':         'Date of birth — DDMMYYYY or last 4 digits of card',
  'Emirates NBD': 'Date of birth — DDMMYYYY or last 4 digits of card',
  'ADCB':         'Last 4 digits of your card number',
  'FAB':          'Date of birth — DDMMYYYY',
}

function detectBank(filename: string, hint?: string | null): string | null {
  if (hint && BANK_HINTS[hint]) return hint
  const n = filename.toLowerCase()
  if (n.includes('hdfc'))                                 return 'HDFC'
  if (n.includes('icici'))                                return 'ICICI'
  if (n.includes('axis'))                                 return 'Axis'
  if (n.includes('sbi'))                                  return 'SBI'
  if (n.includes('kotak'))                                return 'Kotak'
  if (n.includes('yes'))                                  return 'YES Bank'
  if (n.includes('indusind'))                             return 'IndusInd'
  if (n.includes('amex') || n.includes('american'))       return 'AmEx'
  if (n.includes('emirates') || n.includes('enbd'))       return 'Emirates NBD'
  if (n.includes('adcb'))                                 return 'ADCB'
  if (n.includes('fab') || n.includes('first abu dhabi')) return 'FAB'
  return null
}

// ──── PDF text extraction — row-aware (local, no external API) ───────
// Reconstructs table rows from positioned text items so multi-column
// bank statements come out as proper line-by-line text.

async function extractStructuredText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')

  // Throws PasswordException if locked / wrong password
  const pdfDoc = await getDocumentProxy(bytes, password ? { password } : {}) as any

  let fullText = ''

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page        = await pdfDoc.getPage(p)
    const textContent = await page.getTextContent()

    // Collect all items with position, sort top-to-bottom then left-to-right
    const rawItems: Array<{ x: number; y: number; str: string }> = []
    for (const item of textContent.items) {
      const i = item as any
      if (!i.str?.trim() || !i.transform) continue
      rawItems.push({ x: i.transform[4], y: i.transform[5], str: i.str })
    }
    rawItems.sort((a, b) => b.y - a.y || a.x - b.x)

    // Cluster into rows: new row when Y gap > 3 units (handles baseline shifts)
    const rowMap = new Map<number, Array<{ x: number; str: string }>>()
    let rowKey = -1
    let lastY  = NaN
    for (const item of rawItems) {
      if (isNaN(lastY) || Math.abs(item.y - lastY) > 3) {
        rowKey = Math.round(item.y)
        lastY  = item.y
      }
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, [])
      rowMap.get(rowKey)!.push({ x: item.x, str: item.str })
    }

    // Emit rows top-to-bottom
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

// ──── Date parsing ────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function toISODate(raw: string, defaultYear?: number): string | null {
  const s = raw.trim()
  const year = defaultYear ?? new Date().getFullYear()

  // DD/MM/YYYY or DD-MM-YYYY (full date with year)
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  // DD MMM YYYY
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/)
  if (m) {
    const y  = m[3].length === 2 ? `20${m[3]}` : m[3]
    const mo = MONTH_MAP[m[2].slice(0, 3).toLowerCase()] ?? '01'
    return `${y}-${mo}-${m[1].padStart(2, '0')}`
  }
  // DD/MM only (no year) — infer year from statement
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (m) {
    const d = parseInt(m[1]), mo = parseInt(m[2])
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
  }
  return null
}

// ──── Categorisation (rule-based, no AI) ─────────────────────────────

const CAT_RULES: [RegExp, string][] = [
  // Food & dining — delivery apps, restaurants, cafes
  [/swiggy|zomato|uber\s*eat|talabat|deliveroo|keet\b|noon\s*food|carriage\b|hunger\s*station|eatigo|dineout|blinkit|zepto|dunzo|magicpin|instamrt|bigbasket|grofers|jiomart|restaurant|restaur[ae]?nt?|restoran|caf[eé]|mcdonald|kfc|pizza|domino|starbucks|haldiram|dunkin|subway|burger|sushi|biryani|bakery|canteen|dining|eatery|catering|kitchen|diner|grill|shawarma|falafel|juice\s*bar|food(?!stuff)|çay|bistro|brasserie|trattoria|osteria|tavern|chophouse|steakhouse|noodle|ramen|pho\b|wok\b|bbq|barbecue/i, 'Food'],
  // Transport
  [/uber(?!\s*eat)|\bola\b|rapido|metro\b|auto\b|cab\b|taxi\b|rickshaw|yatri|redbus|abhibus|yulu|bounce|careem|transport/i, 'Transport'],
  // Travel
  [/irctc|makemytrip|cleartrip|goibibo|easemytrip|yatra|\bhotel\b|airbnb|\boyo\b|booking\.com|agoda|marriott|taj\s*hotel|flight|airline|air\s*india|indigo|spicejet|vistara|airport|resort|motel|\binn\b|\blodge\b/i, 'Travel'],
  // Subscriptions
  [/netflix|hotstar|disney|prime\s*video|amazon\s*prime|zee5|sonyliv|youtube\s*prem|apple\s*tv|jiocinema|\baha\b|voot|spotify|gaana|wynk|apple\s*music|bookmyshow|\bpvr\b|\binox\b|cinepolis/i, 'Subscription'],
  // Utilities
  [/electricity|bescom|msedcl|tata\s*power|adani\s*elec|water\s*board|\bgas\b|mahanagar|\bigl\b|airtel|\bjio\b|vodafone|\bvi\b|bsnl|\bidea\b|postpaid|prepaid|broadband|wifi|dish\s*tv|tata\s*sky|\bd2h\b|etisalat|\bdu\b|telecom/i, 'Utilities'],
  // Health & wellness
  [/\bsalon\b|\bspa\b|barber|grooming|\bbeauty\b|parlou?r|hair\s*cut|haircut|cosmetic|make[\s-]?up|manicure|pedicure|waxing|threading|nail\s*(?:bar|salon|studio)|\bsephora\b/i, 'Personal Care'],
  [/apollo|practo|pharmeasy|netmeds|medplus|healthkart|1mg|doctor|hospital|clinic|pharmacy|\bmed\b|diagnostic|dental|optical|massage|wellness|fitness|gym\b/i, 'Health'],
  // Entertainment
  [/snooker|billiard|bowling|cinema|movie|concert|gaming|arcade|laser\s*tag|karting|paintball/i, 'Entertainment'],
  // Shopping & grocery
  [/amazon(?!\s*prime)|flipkart|myntra|ajio|nykaa|meesho|snapdeal|reliance\s*digital|croma|d[\s\-]?mart|big\s*bazaar|shoppers\s*stop|\bwestside\b|\bh&m\b|zara|uniqlo|decathlon|supermarket|hypermarket|foodstuff|general\s*trad|trading|carrefour|lulu\b|spinneys|waitrose|\bmart\b|\bmarket\b/i, 'Shopping'],
  // Education
  [/byju|unacademy|coursera|udemy|skillshare|upgrad|vedantu|simplilearn|toppr|school\s*fee|tuition|coaching|exam\s*fee/i, 'Education'],
  // Investment
  [/income\s*tax|\btax\s*pay|\btds\b|advance\s*tax|self[-\s]*assess|tax\s*challan|\bitns\b|property\s*tax|municipal\s*tax|road\s*tax|\bcbdt\b/i, 'Tax Payment'],
  [/zerodha|groww|upstox|\bcoin\b|mutual\s*fund|\bsip\b|\bppf\b|\bnps\b|\blic\b|sbi\s*life|hdfc\s*life|icici\s*pru|max\s*life|insurance|policy\s*prem/i, 'Investment'],
  // Loan on Card — ENBD LOC/DAC transit, line-of-credit payments
  [/\bloc\s+and\s+dac\b|loc\s+transit|dac\s+transit|line\s+of\s+credit\s+(?:payment|debit)|loc\s+(?:debit|payment)|loan\s+on\s+card/i, 'Loan on Card'],
  // EMI / Loan
  [/\bemi\b|loan\s*inst|mortgage|\bnach\b|\bmandate\b|\becs\b/i, 'EMI/Loan'],
  // Transfer
  [/neft|rtgs|imps|fund\s*trans|wire\s*trans/i, 'Transfer'],
]

function categorize(text: string): string {
  for (const [re, cat] of CAT_RULES) {
    if (re.test(text)) return cat
  }
  return 'Other'
}

// Strip UAE / Indian city names appended to merchant descriptions
const CITY_SUFFIX = /(abu\s*dhabi|abudhabi|al\s+ain|al\s+rahaa?|dubai|sharjah|ajman|fujairah|ras\s*al|mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata)\s*$/i

function cleanMerchant(raw: string): string {
  let s = raw
    // strip leading transaction/posting date(s): 27/02/2026, 27-02-26, 27 Feb 2026 …
    .replace(/^[\s|*#-]*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4})[\s,|]*)+/i, '')
    .replace(/\b\d{8,}\b/g, '')     // strip reference numbers (8+ digits)
    .replace(CITY_SUFFIX, '')        // strip trailing city name
    .replace(CITY_SUFFIX, '')        // second pass (handles double city suffix)
    .replace(/[*#|\\]{1,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return s
    .split(' ')
    .filter(Boolean)
    .map(w => w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim()
}

// ──── Statement metadata ──────────────────────────────────────────────
//
// Strategy: "find the label, then look 200 chars ahead for the value."
// This handles PDFs where the label and value are in separate columns —
// after Y-row clustering they may end up adjacent but with filler text
// between them, or even on the very next text row.

function detectMeta(text: string): {
  currency:        string
  card_last4:      string | null
  card_name:       string | null
  period_from:     string | null
  period_to:       string | null
  bank_name:       string | null
  inferredYear:    number
  credit_limit:    number | null
  outstanding_bal: number | null
  minimum_due:     number | null
  due_date:        string | null
} {
  const currency = /\bAED\b|UAE\s*Dirham|درهم/i.test(text) ? 'AED' : 'INR'

  // ── Card last-4 ──────────────────────────────────────────────────────
  // Handles: "XXXX1234", "XXXX XXXX XXXX 1234", "**** **** **** 1234",
  //          "4532 **** **** 1234", "Card No: XXXXXXXX1234"
  const card4 =
    text.match(/(?:\d{4}[\s\-])?(?:[xX*]{4}[\s\-]){2,}(\d{4})/)?.[1] ??
    text.match(/[xX*]{4,}\s*(\d{4})/)?.[1] ??
    text.match(/(?:card\s*(?:no|number|num)[.:]\s*[xX*\d\s\-]{8,})(\d{4})/i)?.[1] ??
    null

  // ── Statement period ─────────────────────────────────────────────────
  const periodMatch = text.match(
    /(?:statement\s*(?:period|date\s*range)|billing\s*period|from)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|–|-)?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  )
  const period_from = periodMatch ? toISODate(periodMatch[1]) : null
  const period_to   = periodMatch ? toISODate(periodMatch[2]) : null

  // ── Year inference ───────────────────────────────────────────────────
  const yearMatch    = text.match(/\b(20\d{2})\b/)
  const inferredYear = yearMatch
    ? parseInt(yearMatch[1])
    : period_from ? parseInt(period_from.slice(0, 4)) : new Date().getFullYear()

  // ── Bank name ────────────────────────────────────────────────────────
  const BANK_RE = /\b(HDFC(?:\s*Bank)?|ICICI(?:\s*Bank)?|Axis\s*Bank|SBI(?:\s*Card|\s*Bank)?|Kotak(?:\s*Mahindra(?:\s*Bank)?)?|YES\s*Bank|IndusInd(?:\s*Bank)?|American\s*Express|AMEX|Emirates\s*NBD|ENBD|ADCB|FAB|First\s*Abu\s*Dhabi|Mashreq|RAK\s*Bank|RAKBANK|Standard\s*Chartered|HSBC|Citi(?:bank)?|RBL(?:\s*Bank)?|AU\s*(?:Small\s*Finance\s*)?Bank|Federal\s*Bank|Union\s*Bank|Punjab\s*National|Canara\s*Bank|Bank\s*of\s*Baroda|IDFC(?:\s*First)?|Bandhan\s*Bank|Karnataka\s*Bank)\b/i
  const bankMatch = text.slice(0, 3000).match(BANK_RE) ?? text.match(BANK_RE)
  const bank_name = bankMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null

  // ── Card product name (e.g. "Regalia", "Millennia", "Infinia") ───────
  // Appears near the bank name or "credit card" label in the header
  const CARD_PRODUCT_RE = /\b(Regalia|Millennia|Infinia|Diners\s*(?:Club\s*)?(?:Black|Privilege|Rewardz)?|Moneyback|Swiggy\s*HDFC|Tata\s*Neu|Pixel\s*Play|Biz(?:First|Power|Black)|Freedom|Doctor\s*Regalia|Platinum|Titanium|Times\s*Points|RuPay\s*(?:Platinum)?|UPI\s*RuPay|Magnus|Atlas|Ace|Flipkart\s*Axis|Amazon\s*Pay|Cashback\s*SBI|SimplyCLICK|SimplyYOGA|Elite|Vistara|Sapphiro|Emerald|Reserve|Ultima|Voyage|Cocktail|Treat)\b/i
  const cardProductMatch = text.slice(0, 3000).match(CARD_PRODUCT_RE)
  const card_name = cardProductMatch
    ? `${bank_name ?? 'Credit Card'} ${cardProductMatch[1]}`
    : null

  // ── Look-ahead helpers ───────────────────────────────────────────────
  // Finds a label anywhere in text, then grabs the first decimal amount
  // within the next 250 chars — handles column-separated PDF layouts.
  function findAmt(labelRe: RegExp): number | null {
    const m = text.match(labelRe)
    if (!m || m.index === undefined) return null
    const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 250)
    // Match Indian (1,23,456.78) or Western (123,456.78) decimal amounts
    const amtM = slice.match(/([\d,]+\.\d{2})/)
    if (!amtM) return null
    const n = parseFloat(amtM[1].replace(/,/g, ''))
    return isNaN(n) || n <= 0 ? null : n
  }

  // Finds a label then grabs the first date within the next 120 chars
  function findDate(labelRe: RegExp): string | null {
    const m = text.match(labelRe)
    if (!m || m.index === undefined) return null
    const slice = text.slice(m.index + m[0].length, m.index + m[0].length + 120)
    const dateM = slice.match(
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})/i
    )
    if (!dateM) return null
    return toISODate(dateM[1].trim(), inferredYear)
  }

  // ── Credit limit ─────────────────────────────────────────────────────
  // HDFC: "Credit Limit", "Total Credit Limit"
  // UAE:  "Credit Limit", "Credit Line Amount"
  const credit_limit = findAmt(
    /(?:total\s+)?credit\s+(?:limit|line(?:\s+amount)?)/i
  )

  // ── Outstanding balance / total amount due ───────────────────────────
  // HDFC: "Total Amount Due", "Current Outstanding", "Outstanding Amount"
  // UAE:  "Total Amount Due", "Closing Balance", "Amount Due"
  const outstanding_bal = findAmt(
    /total\s+amount\s+due|(?:current\s+)?outstanding\s+(?:balance|amount)|(?:total\s+)?balance\s+due|closing\s+balance(?:\s+(?:carried|c\/f|c\/d))?|amount\s+(?:due|payable)/i
  )

  // ── Minimum amount due ───────────────────────────────────────────────
  // HDFC: "Minimum Amount Due"
  // UAE:  "Minimum Payment Due", "Minimum Due"
  const minimum_due = findAmt(
    /minimum\s+(?:amount|payment)?\s*due|min(?:imum)?\s+(?:amount|pay(?:ment)?)\s+due|minimum\s+payment(?:\s+due)?/i
  )

  // ── Payment due date ─────────────────────────────────────────────────
  // HDFC: "Payment Due Date"
  // UAE:  "Due Date", "Payment Due Date", "Last Date of Payment"
  const due_date = findDate(
    /payment\s+due\s+date|due\s+date|pay(?:ment)?\s+by(?:\s+date)?|last\s+(?:date\s+(?:for|of)\s+)?payment/i
  )

  return {
    currency, card_last4: card4, card_name, period_from, period_to,
    bank_name, inferredYear,
    credit_limit, outstanding_bal, minimum_due, due_date,
  }
}

// ──── Transaction parser ──────────────────────────────────────────────

// Matches: DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, DD/MM (no year)
// The short DD/MM form uses negative lookahead to not fire inside full dates
const DATE_PAT = '(\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{2,4}|\\d{1,2}[\\/\\-]\\d{1,2}(?![\\/\\-\\d]))'
const AMT_PAT  = '([0-9]{1,3}(?:,[0-9]{2,3})*\\.[0-9]{2})'

const SKIP_LINE = /^(date\b|sl\b|sr\b|no\b|description|narration|particulars|transaction\s*(date|details|ref)|posting|opening|closing|total\b|sub.?total|carry|balance\b|statement|account|card\b|page\s*\d|amount\b|debit\b|credit\b|aed\s*amount)\s*$/i

// Credit line classification — order matters: check payment before refund before generic credit
const PAYMENT_PAT = /\b(payment\s*(?:received|thank\s*you|-\s*thank)?|thank\s*you\s*payment|auto\s*pay(?:ment)?|bill\s*pay(?:ment)?|repayment|online\s*pay(?:ment)?|neft\s*cr|imps\s*cr|transfer\s*cr|pay\s*to\s*cc)\b/i
const REFUND_PAT  = /\b(refund|reversal|reversed|chargeback|dispute\s*cr|credit\s*adj(?:ustment)?|cashback|cash\s*back|reward\s*redemption|loyalty\s*credit|welcome\s*bonus|fee\s*wai(?:ver|ved)|interest\s*rev(?:ersal)?)\b/i

function parseTransactions(text: string, inferredYear: number): any[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5)

  const results: any[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SKIP_LINE.test(line)) continue

    // Must contain at least one date
    const dateMatches = Array.from(line.matchAll(new RegExp(DATE_PAT, 'gi')))
    if (dateMatches.length === 0) continue

    const firstDate = dateMatches[0]
    const isoDate   = toISODate(firstDate[1].trim(), inferredYear)
    if (!isoDate) continue

    // Collect amounts (not inside the long reference numbers — those have no decimal)
    let amountMatches = Array.from(line.matchAll(new RegExp(AMT_PAT, 'g')))

    // Peek next line if no amount found (some formats wrap)
    if (amountMatches.length === 0 && i + 1 < lines.length) {
      const next = lines[i + 1]
      if (!new RegExp(DATE_PAT, 'i').test(next)) {
        amountMatches = Array.from(next.matchAll(new RegExp(AMT_PAT, 'g')))
      }
    }
    if (amountMatches.length === 0) continue

    // UAE format: line has a 15+ digit reference number (no balance column)
    // → AED amount is always the last decimal on the line
    // India format: 3+ amounts means last is running balance → take second-to-last
    const longRef = line.match(/\b\d{15,}\b/)
    const txnAmtMatch = longRef
      ? amountMatches[amountMatches.length - 1]
      : amountMatches.length >= 3
        ? amountMatches[amountMatches.length - 2]
        : amountMatches[0]

    const amount = parseFloat(txnAmtMatch[1].replace(/,/g, ''))
    if (!amount || amount <= 0 || amount > 50_000_000) continue

    // Credit indicator — "Cr", "CR", "Credit" after the amount
    const afterAmt = line.slice((txnAmtMatch.index ?? 0) + txnAmtMatch[0].length)
    const isCr     = /\bCr\b|CR\b|\bCredit\b/i.test(afterAmt)

    const dateEnd = (firstDate.index ?? 0) + firstDate[0].length
    let merchant: string

    if (longRef && longRef.index !== undefined) {
      // UAE: merchant sits between posting date and the 22-digit reference number
      merchant = line.slice(dateEnd, longRef.index).trim()
      merchant = merchant.replace(new RegExp('^' + DATE_PAT, 'i'), '').trim()
    } else {
      // India: merchant is between first date and first amount
      const firstAmtIdx = amountMatches[0].index ?? line.length
      merchant = line.slice(dateEnd, firstAmtIdx).trim()
      merchant = merchant.replace(new RegExp('^' + DATE_PAT, 'i'), '').trim()
      merchant = merchant.replace(/\b\d{8,}\b/g, '').replace(/\s+/g, ' ').trim()
    }

    // Strip inline foreign currency codes (e.g. "29.99 USD" in description)
    merchant = merchant.replace(/\b(USD|EUR|GBP|AED|INR|SAR|QAR|CHF|JPY|SGD|CAD|AUD)\b/gi, '').replace(/\s+/g, ' ').trim()

    if (!merchant || merchant.length < 2) continue

    const cleaned = cleanMerchant(merchant)
    if (!cleaned || cleaned.length < 2) continue

    // Classify credit lines: payment vs refund vs generic income
    let txn_type: string
    let category: string
    let finalMerchant = cleaned

    if (isCr) {
      if (PAYMENT_PAT.test(line) || PAYMENT_PAT.test(cleaned)) {
        // Bill payment made — treat as a transfer, not income
        txn_type      = 'transfer'
        category      = 'Transfer'
        finalMerchant = 'Credit Card Payment'
      } else if (REFUND_PAT.test(line) || REFUND_PAT.test(cleaned)) {
        // Merchant refund or cashback
        txn_type = 'income'
        category = 'Refund'
      } else {
        // Other credit (interest waiver, adjustment, etc.)
        txn_type = 'income'
        category = categorize(cleaned)
      }
    } else {
      category = categorize(cleaned)
      txn_type = (category === 'Loan on Card' || category === 'EMI/Loan') ? 'loan' : 'expense'
    }

    results.push({
      date:        isoDate,
      merchant:    finalMerchant,
      description: merchant.trim(),
      amount,
      txn_type,
      category,
    })
  }

  // Deduplicate by date + merchant + amount
  const seen = new Set<string>()
  return results.filter(t => {
    const key = `${t.date}|${t.merchant}|${t.amount}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ──── API handler ─────────────────────────────────────────────────────

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

  // Extract text locally (row-aware, no external API call)
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
        hint:      hint ?? 'Usually your date of birth in DDMMYYYY format (e.g. 15021990)',
      })
    }

    return NextResponse.json({ error: 'Failed to read PDF', details: err.message }, { status: 500 })
  }

  if (!pdfText?.trim()) {
    return NextResponse.json({
      error: 'No text found in this PDF. It may be a scanned image — try the Bill / Image option instead.',
    }, { status: 400 })
  }

  const meta         = detectMeta(pdfText)
  const transactions = parseTransactions(pdfText, meta.inferredYear)

  const parseWarning = transactions.length < 2
    ? "Very few transactions were detected. Your bank's PDF layout may need manual review."
    : undefined

  return NextResponse.json({
    success:         true,
    bank_name:       meta.bank_name ?? detectedBank ?? 'Credit Card',
    card_name:       meta.card_name,
    card_last4:      meta.card_last4,
    currency:        meta.currency,
    period:          { from: meta.period_from, to: meta.period_to },
    credit_limit:    meta.credit_limit,
    outstanding_bal: meta.outstanding_bal,
    minimum_due:     meta.minimum_due,
    due_date:        meta.due_date,
    transactions,
    parseWarning,
    _rawPreview:     pdfText.slice(0, 1200),
  })
}
