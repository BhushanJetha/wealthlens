// Local, no-AI parser for bank transaction SMS / email alerts.
// Extracts amount, currency, direction, merchant, date and bank+last4 so a
// pasted or shared message can pre-fill an expense/income for one-tap review.
// Keeps the app's "no external AI for parsing" rule (regex/heuristics only).

export interface ParsedMessage {
  amount: number
  currency: 'INR' | 'AED'
  direction: 'expense' | 'income'
  merchant: string
  date: string            // YYYY-MM-DD
  category: string        // best-effort guess
  bank?: string
  last4?: string
  raw: string
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const BANKS = [
  'HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Yes Bank', 'IDFC', 'IndusInd',
  'PNB', 'Bank of Baroda', 'BOB', 'Canara', 'Union Bank', 'RBL', 'AU Bank',
  'Emirates NBD', 'ENBD', 'ADCB', 'FAB', 'Mashreq', 'Dubai Islamic', 'DIB',
  'RAKBANK', 'ADIB', 'Citi', 'HSBC', 'Standard Chartered',
]

// Light merchant → category guesser (extend freely).
const CAT_RULES: [RegExp, string][] = [
  [/swiggy|zomato|dominos|mcdonald|kfc|restaurant|cafe|coffee|starbucks|eatery|food|dmart|bigbasket|blinkit|zepto|grocery|carrefour|lulu|spinneys/i, 'Food'],
  [/amazon|flipkart|myntra|ajio|meesho|nykaa|shop|mall|noon|namshi|store|retail/i, 'Shopping'],
  [/uber|ola|rapido|metro|petrol|fuel|hpcl|iocl|bpcl|adnoc|eppco|careem|salik|parking|toll/i, 'Transport'],
  [/dewa|sewa|electricity|water|gas|broadband|airtel|jio|vodafone|vi |du |etisalat|internet|recharge|bill/i, 'Utilities'],
  [/netflix|spotify|prime|hotstar|youtube|subscription|icloud|google one|adobe/i, 'Subscription'],
  [/pharmacy|hospital|clinic|apollo|medic|doctor|health|aster|medcare/i, 'Health'],
  [/salary|payroll|stipend|wages/i, 'Salary'],
  [/dividend/i, 'Dividend'],
  [/interest|int\.?cr/i, 'Interest'],
  [/refund|reversal|cashback/i, 'Refund'],
  [/atm|cash withdrawal|cwd/i, 'Other'],
  [/sip|mutual fund|bse limited|nse|zerodha|groww|invest/i, 'Investment'],
]

function guessCategory(merchant: string, text: string, direction: 'expense' | 'income'): string {
  const hay = `${merchant} ${text}`
  for (const [re, cat] of CAT_RULES) if (re.test(hay)) return cat
  return direction === 'income' ? 'Salary' : 'Other'
}

function normaliseNumber(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

// Pull the transaction amount — deliberately skipping "available balance",
// "limit" and similar figures that ride along in the same SMS.
function extractAmount(text: string): { amount: number; currency: 'INR' | 'AED' } | null {
  const re = /(rs\.?|inr|₹|aed|dhs|dirhams?|usd|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(rs\.?|inr|₹|aed|dhs|dirhams?)/gi
  const candidates: { value: number; currency: 'INR' | 'AED'; index: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const curTok = (m[1] || m[4] || '').toLowerCase()
    const numTok = m[2] || m[3]
    if (!numTok) continue
    const value = normaliseNumber(numTok)
    if (!isFinite(value) || value <= 0) continue
    // Skip amounts described as a balance / limit (context before the match).
    const before = text.slice(Math.max(0, m.index - 18), m.index).toLowerCase()
    if (/\b(bal|avbl|avl|available|balance|limit|outstanding|due)\b/.test(before)) continue
    const currency: 'INR' | 'AED' = /aed|dhs|dirham/.test(curTok) ? 'AED' : 'INR'
    candidates.push({ value, currency, index: m.index })
  }
  if (candidates.length === 0) return null
  // The first non-balance amount is almost always the transaction amount.
  const pick = candidates[0]
  return { amount: pick.value, currency: pick.currency }
}

function extractDirection(text: string): 'expense' | 'income' {
  const t = text.toLowerCase()
  // Credits first (a message can contain both words; credit keywords win when explicit)
  if (/\b(credited|received|deposit(ed)?|salary|refund|reversal|cashback|added to)\b/.test(t)
      && !/\b(debited|spent|purchase|withdrawn)\b/.test(t)) return 'income'
  if (/\b(credited|received|deposited)\b.*\b(a\/c|account|acct)\b/.test(t)) return 'income'
  // Default: debits / spends (the common alert)
  return 'expense'
}

function extractDate(text: string): string {
  // ISO first
  let m = text.match(/(20\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // DD-Mon-YY(YY)  e.g. 07-Jun-26, 01Jan2024
  m = text.match(/(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})/)
  if (m && MONTHS[m[2].toLowerCase()]) {
    const d = m[1].padStart(2, '0')
    const mo = String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${mo}-${d}`
  }
  // DD-MM-YY(YY) or DD/MM/YY(YY) — Indian day-first
  m = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31)
      return `${y}-${mo}-${d}`
  }
  return new Date().toISOString().slice(0, 10)
}

function extractMerchant(text: string): string {
  // Common connectors that precede the payee/merchant in bank alerts.
  const patterns = [
    /\b(?:at|@)\s+([A-Za-z0-9][A-Za-z0-9 &._\-*]{1,40}?)(?=\s+(?:on|dt|ref|upi|avl|info|txn|,|;|\.)|$)/i,
    /\b(?:to|towards|paid to|sent to|trf to)\s+([A-Za-z0-9][A-Za-z0-9 &._\-*]{1,40}?)(?=\s+(?:on|dt|ref|upi|avl|info|txn|,|;|\.)|$)/i,
    /\b(?:info|vpa|desc)[:\s]+([A-Za-z0-9][A-Za-z0-9 &._\-*@]{1,40}?)(?=\s+(?:on|ref|avl|,|;|\.)|$)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1]) {
      const cleaned = m[1].replace(/\s+/g, ' ').trim().replace(/[.\-_*]+$/, '').trim()
      if (cleaned.length >= 2) return cleaned
    }
  }
  return ''
}

function extractBank(text: string): { bank?: string; last4?: string } {
  let bank: string | undefined
  for (const b of BANKS) {
    if (new RegExp(`\\b${b.replace(/\s+/g, '\\s*')}\\b`, 'i').test(text)) { bank = b; break }
  }
  const m = text.match(/(?:a\/c|acct|account|card|ending|xx+|no\.?)\s*[Xx*•#\s-]*(\d{3,4})\b/i)
  const last4 = m ? m[1] : undefined
  return { bank, last4 }
}

// Returns null if no amount can be found (not a parseable transaction message).
export function parseBankMessage(input: string): ParsedMessage | null {
  const text = (input || '').replace(/\s+/g, ' ').trim()
  if (text.length < 6) return null
  const amt = extractAmount(text)
  if (!amt) return null
  const direction = extractDirection(text)
  const merchant = extractMerchant(text)
  const { bank, last4 } = extractBank(text)
  return {
    amount: amt.amount,
    currency: amt.currency,
    direction,
    merchant: merchant || (direction === 'income' ? 'Bank credit' : 'Card/UPI payment'),
    date: extractDate(text),
    category: guessCategory(merchant, text, direction),
    bank,
    last4,
    raw: text,
  }
}
