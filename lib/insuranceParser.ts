// Rule-based reader for insurance policy schedules (India + UAE). No AI: it
// looks for the usual labels ("Sum Insured", "Policy No.", "Period of
// Insurance"…) and returns whatever it finds for the user to check in the
// Add-policy form. Fields it can't find are left out.

export interface ParsedPolicy {
  policy_name?: string; policy_number?: string; provider?: string
  policy_type?: 'term_life' | 'health' | 'property' | 'vehicle' | 'travel' | 'other'
  sum_assured?: number; annual_premium?: number
  premium_frequency?: 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
  start_date?: string; expiry_date?: string; next_premium_date?: string
  currency?: 'AED' | 'INR'; country?: 'UAE' | 'India'
  insured_members?: string[]
}

// Longest names first so "HDFC ERGO" wins over "HDFC Life" style prefixes
const PROVIDERS: [RegExp, string][] = ([
  ['life insurance corporation|\\bLIC of India\\b', 'LIC of India'],
  ['hdfc\\s*ergo', 'HDFC ERGO'], ['hdfc\\s*life', 'HDFC Life'],
  ['icici\\s*lombard', 'ICICI Lombard'], ['icici\\s*pru', 'ICICI Prudential Life'],
  ['sbi\\s*general', 'SBI General'], ['sbi\\s*life', 'SBI Life'],
  ['axis\\s*max\\s*life|max\\s*life', 'Axis Max Life'], ['niva\\s*bupa|max\\s*bupa', 'Niva Bupa'],
  ['star\\s*health', 'Star Health Insurance'], ['care\\s*health|religare\\s*health', 'Care Health Insurance'],
  ['tata\\s*aia', 'Tata AIA Life'], ['tata\\s*aig', 'Tata AIG'],
  ['bajaj\\s*allianz\\s*life|bajaj\\s*life', 'Bajaj Allianz Life'], ['bajaj\\s*(allianz|general)', 'Bajaj Allianz General'],
  ['kotak\\s*(mahindra\\s*)?life', 'Kotak Life'], ['zurich\\s*kotak|kotak\\s*general', 'Zurich Kotak General'],
  ['aditya\\s*birla\\s*(sun\\s*life)', 'Aditya Birla Sun Life'], ['aditya\\s*birla\\s*health|activ\\s*health', 'Aditya Birla Health'],
  ['manipal\\s*cigna|manipalcigna', 'ManipalCigna'], ['pnb\\s*metlife', 'PNB MetLife'],
  ['canara\\s*hsbc', 'Canara HSBC Life'], ['edelweiss', 'Edelweiss'], ['future\\s*generali', 'Future Generali'],
  ['iffco[\\s-]*tokio', 'IFFCO Tokio'], ['royal\\s*sundaram', 'Royal Sundaram'], ['cholamandalam|chola\\s*ms', 'Chola MS'],
  ['go\\s*digit|digit\\s*insurance', 'Digit Insurance'], ['\\backo\\b', 'Acko'],
  ['new\\s*india\\s*assurance', 'New India Assurance'], ['united\\s*india', 'United India Insurance'],
  ['oriental\\s*insurance', 'Oriental Insurance'], ['national\\s*insurance', 'National Insurance'],
  ['reliance\\s*general', 'Reliance General'], ['reliance\\s*nippon|nippon\\s*life', 'Reliance Nippon Life'],
  ['universal\\s*sompo', 'Universal Sompo'], ['liberty\\s*general', 'Liberty General'],
  ['\\bdaman\\b|national\\s*health\\s*insurance\\s*company', 'Daman'], ['sukoon|oman\\s*insurance', 'Sukoon (Oman Insurance)'],
  ['\\bgig\\b|gulf\\s*insurance|axa\\s*gulf', 'GIG Gulf'], ['orient\\s*insurance', 'Orient Insurance'],
  ['\\badnic\\b|abu\\s*dhabi\\s*national\\s*insurance', 'ADNIC'], ['dubai\\s*insurance', 'Dubai Insurance'],
  ['\\bsalama\\b', 'Salama'], ['takaful\\s*emarat', 'Takaful Emarat'], ['watania', 'Watania'],
  ['fidelity\\s*united', 'Fidelity United'], ['union\\s*insurance', 'Union Insurance'],
  ['bupa\\s*global', 'Bupa Global'], ['cigna', 'Cigna'], ['metlife', 'MetLife'], ['allianz', 'Allianz'], ['\\baxa\\b', 'AXA'],
  ['\\brsa\\b', 'RSA'], ['zurich', 'Zurich'],
] as [string, string][]).map(([re, name]) => [new RegExp(re, 'i'), name])

const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
const pad = (n: number | string) => String(n).padStart(2, '0')

// Date tokens: 15/07/2025, 15-07-25, 15.07.2025, 15-Jul-2025, 15 July 2025, July 15, 2025, 2025-07-15
const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}[\s\-]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,]*\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi

const HAS_DATE = new RegExp(DATE_RE.source, 'i')

export function toIsoDate(tok: string): string | undefined {
  const s = tok.trim().toLowerCase()
  let y: number, m: string, d: number
  let r: RegExpMatchArray | null
  if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +r[1]; m = r[2]; d = +r[3] }
  else if ((r = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { d = +r[1]; m = pad(r[2]); y = +r[3] }   // day first (India/UAE)
  else if ((r = s.match(/^(\d{1,2})[\s\-]?([a-z]{3})[a-z]*[\s\-,]*(\d{2,4})$/))) { d = +r[1]; m = MON[r[2]]; y = +r[3] }
  else if ((r = s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/))) { m = MON[r[1]]; d = +r[2]; y = +r[3] }
  else return undefined
  if (y < 100) y += 2000
  if (!m || +m < 1 || +m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return undefined
  return `${y}-${m}-${pad(d)}`
}

// "10,00,000" / "5 Lakh" / "1.5 Cr" / "AED 500,000.00" → number
export function toAmount(s: string): number | undefined {
  const r = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b|mn|million)?/i)
  if (!r) return undefined
  let n = Number(r[1].replace(/,/g, ''))
  const u = (r[2] ?? '').toLowerCase()
  if (/^(lakh|lac|l$)/.test(u)) n *= 1e5
  else if (/^(crore|cr)/.test(u)) n *= 1e7
  else if (u === 'k') n *= 1e3
  else if (u === 'mn' || u === 'million') n *= 1e6
  return isFinite(n) && n > 0 ? n : undefined
}

// First amount after a label on the same line (or the next line when the
// label stands alone), skipping years and tiny numbers
function amountAfter(lines: string[], label: RegExp, min = 100): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label)
    if (!m) continue
    for (const rest of [lines[i].slice((m.index ?? 0) + m[0].length), lines[i + 1] ?? '']) {
      const cleaned = rest.replace(DATE_RE, ' ')
      for (const tok of Array.from(cleaned.matchAll(/(?:₹|rs\.?|inr|aed|dhs?\.?)?\s*(\d[\d,]*(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr\b|mn|million)?)/gi))) {
        const n = toAmount(tok[1])
        if (n != null && n >= min && !/^(19|20)\d{2}$/.test(tok[1].trim())) return n
      }
    }
  }
  return undefined
}

function dateAfter(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label)
    if (!m) continue
    for (const rest of [lines[i].slice((m.index ?? 0) + m[0].length), lines[i + 1] ?? '']) {
      const tok = rest.match(DATE_RE)?.[0]
      const iso = tok && toIsoDate(tok)
      if (iso) return iso
    }
  }
  return undefined
}

export function parseInsuranceText(text: string): ParsedPolicy {
  const out: ParsedPolicy = {}
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const head = lines.slice(0, 60).join('\n')

  // Provider: earliest known insurer name, preferring the first page
  let best: { name: string; at: number } | null = null
  for (const [re, name] of PROVIDERS) {
    const at = head.search(re) >= 0 ? head.search(re) : text.search(re) >= 0 ? 100000 + text.search(re) : -1
    if (at >= 0 && (!best || at < best.at)) best = { name, at }
  }
  if (best) out.provider = best.name

  // Currency / country by marker count
  const aed = (text.match(/\bAED\b|\bDhs?\b\.?|dirham|united arab emirates|\bU\.?A\.?E\b|dubai|abu dhabi|sharjah/gi) ?? []).length
  const inr = (text.match(/₹|\bRs\.?\s|\bINR\b|rupees|\bIRDAI?\b|\bGST(IN)?\b|lakh/gi) ?? []).length
  if (aed || inr) { out.currency = aed > inr ? 'AED' : 'INR'; out.country = aed > inr ? 'UAE' : 'India' }

  // Policy type by keyword score
  const score = (re: RegExp) => (text.match(re) ?? []).length
  const types: [ParsedPolicy['policy_type'], number][] = [
    ['health', score(/\bhealth\b|medical|mediclaim|hospitali[sz]ation|floater|in-?patient|out-?patient|\bTPA\b|network|member\s*id|annual\s*limit|co-?pay(ment)?|deductible/gi)
      + (/^(Star Health|Care Health|Niva Bupa|Aditya Birla Health|ManipalCigna|Daman|Bupa Global|Cigna)/.test(out.provider ?? '') ? 2 : 0)],
    ['term_life', score(/\bterm (plan|insurance|life)\b|life assured|death benefit|sum assured on death|\blife insurance\b|nominee/gi)],
    ['vehicle', score(/\bmotor\b|vehicle|\bIDV\b|chassis|engine no|registration no|own damage|third party/gi)],
    ['property', score(/home insurance|householder|building|contents|fire (and|&) (allied|special)|property insurance/gi)],
    ['travel', score(/\btravel\b|\btrip\b|journey|passport no|overseas/gi)],
  ]
  const top = types.sort((a, b) => b[1] - a[1])[0]
  out.policy_type = top[1] >= 2 ? top[0] : 'other'

  const num = text.match(/(?:policy|certificate|member(?:ship)?|card)\s*(?:no\.?|number|#|id)\s*[:\-]?\s*((?=[A-Z\/\-]*\d)[A-Z0-9][A-Z0-9\/\-]{4,})/i)
  if (num) out.policy_number = num[1].replace(/[-/]+$/, '')

  const plan = text.match(/(?:plan|product)(?:\s*name)?\s*[:\-]\s*([^\n]{3,60})/i)
  if (plan) out.policy_name = plan[1].replace(/\s{2,}.*/, '').trim()

  out.sum_assured = amountAfter(lines, /sum\s*(assured|insured)|basic\s*sum|cover(age)?\s*amount|insured\s*declared\s*value|\bIDV\b|annual\s*(benefit\s*)?limit|overall\s*limit/i, 1000)

  // Premium: prefer a total (incl. tax), then any premium line
  const prem = amountAfter(lines, /total\s*(annual\s*)?premium|premium\s*(amount\s*)?(payable|paid)|gross\s*premium|total\s*amount\s*(payable|paid)/i, 50)
    ?? amountAfter(lines, /annual\s*premium|installment\s*premium|instalment\s*premium|\bpremium\b/i, 50)
  const freqTxt = text.match(/(?:mode|frequency)\s*(?:of\s*premium(?:\s*payment)?)?\s*[:\-]?\s*(monthly|quarterly|half[\s-]*yearly|semi[\s-]*annual|annual|yearly|single)/i)?.[1]?.toLowerCase()
  if (freqTxt) out.premium_frequency = freqTxt.startsWith('month') ? 'monthly' : freqTxt.startsWith('quarter') ? 'quarterly' : /half|semi/.test(freqTxt) ? 'semi_annual' : 'annual'
  if (prem) {
    // An instalment amount is scaled to a year
    const perYear = { monthly: 12, quarterly: 4, semi_annual: 2, annual: 1 }[out.premium_frequency ?? 'annual']
    const isInstalment = /instal?ment\s*premium/i.test(text) && !/annual\s*premium/i.test(text)
    out.annual_premium = Math.round(isInstalment ? prem * perYear : prem)
  }

  // Dates: "Period of insurance 15/07/2025 to 14/07/2026" first, then labels
  for (const l of lines) {
    if (!/period|valid|cover(age)?\s*(period|from)|policy\s*term|from/i.test(l)) continue
    const ds = (l.match(DATE_RE) ?? []).map(toIsoDate).filter(Boolean) as string[]
    if (ds.length >= 2 && ds[0] < ds[1]) { out.start_date = ds[0]; out.expiry_date = ds[1]; break }
  }
  out.start_date ??= dateAfter(lines, /(policy\s*)?(start|commencement|inception|effective|risk\s*start|issue)\s*date|date\s*of\s*(commencement|inception|issue)|valid\s*from/i)
  out.expiry_date ??= dateAfter(lines, /(policy\s*)?(expiry|end|maturity)\s*date|date\s*of\s*(expiry|maturity)|valid\s*(till|until|upto|up\s*to)|expires?\s*on/i)
  out.next_premium_date = dateAfter(lines, /next\s*(premium\s*)?due|due\s*date\s*(of|for)\s*(next|renewal)|renewal\s*(due\s*)?date|next\s*renewal/i)

  // Members: relationships on lines that also carry a birth date or age
  const rel = new Set<string>()
  for (const l of lines) {
    if (!HAS_DATE.test(l) && !/\b(age|dob|birth)\b/i.test(l)) continue
    for (const r of Array.from(l.matchAll(/\b(self|spouse|wife|husband|son|daughter|father|mother|child)\b/gi)))
      rel.add(r[1][0].toUpperCase() + r[1].slice(1).toLowerCase())
  }
  if (rel.size) out.insured_members = Array.from(rel)

  if (!out.policy_name && out.provider) {
    const label = { health: 'Health', term_life: 'Term life', vehicle: 'Motor', property: 'Home', travel: 'Travel', other: 'Insurance' }[out.policy_type ?? 'other']
    out.policy_name = `${out.provider} ${label}`
  }
  for (const k of Object.keys(out) as (keyof ParsedPolicy)[]) if (out[k] == null) delete out[k]
  return out
}
