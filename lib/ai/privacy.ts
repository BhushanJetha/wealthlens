// What leaves for Claude, and what never does. Every word sent passes through
// mask(): names (yours, your family's, your banks', accounts', cards') become
// ***, account and card numbers, phone numbers and emails become ***, and every
// amount becomes a placeholder like [A3]. Claude may quote a placeholder; your
// server puts the real figure back before you see the answer, so Claude never
// learns how much you have. Percentages, ratios, dates and fund names are kept:
// that's what the answers are worked out from.

export class Vault {
  private byToken = new Map<string, { text: string; value: number | null }>()
  private byText = new Map<string, string>()
  private n = 0
  // A placeholder for an amount; the same amount gets the same placeholder
  amount(text: string, value: number | null = null) {
    const key = text.trim()
    const had = this.byText.get(key)
    if (had) return had
    const token = `[A${++this.n}]`
    this.byText.set(key, token); this.byToken.set(token, { text: key, value })
    return token
  }
  value(token: string) { return this.byToken.get(String(token).trim())?.value ?? null }
  restore(s: string) { return s.replace(/\[A(\d+)\]/g, m => this.byToken.get(m)?.text ?? m) }
  get size() { return this.n }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// "1.5 lakh", "₹2,40,000", "AED 12,500", "3.2L" → the number it means
export function amountValue(text: string): number | null {
  const t = text.toLowerCase().replace(/[₹,]|aed|inr|rs\.?/g, '').trim()
  const m = t.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  if (/crore|cr\b/.test(t)) return n * 1e7
  if (/lakh|lac|\bl\b|\dl\b/.test(t)) return n * 1e5
  if (/thousand|\bk\b|\dk\b/.test(t)) return n * 1e3
  if (/\bm\b|\dm\b|million/.test(t)) return n * 1e6
  return n
}

const SUFFIX = '(?:\\s?(?:L|Cr|K|M|lakhs?|lacs?|crores?|thousand|million)\\b)?'
// A number: digits, optionally grouped with commas (never a trailing comma)
const NUM = '\\d+(?:,\\d{2,3})*(?:\\.\\d+)?'
const MONEY_SYM = new RegExp(`(?:₹|\\bAED|\\bINR|\\bRs\\.?)\\s?[−-]?${NUM}${SUFFIX}`, 'gi')
const MONEY_WORD = new RegExp(`[−-]?${NUM}\\s?(?:L|Cr|lakhs?|lacs?|crores?|thousand|million)\\b`, 'gi')
const GROUPED = /\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b/g
const BIG = /\b\d{4,}(?:\.\d+)?\b/g

const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
const DAY_MONTH = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTHS}\\b|\\b${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi')

// allNumbers: hide every number, small ones too (for what you type or say, where
// "250 at Lulu" is the amount); percentages and dates stay
export function mask(text: string, vault: Vault, names: string[] = [], opts: { allNumbers?: boolean } = {}): string {
  if (!text) return text
  let s = String(text)
  // Dates and years stay as they are (set aside first, so a date never reads as a phone number)
  const kept: string[] = []
  const keep = (m: string) => { kept.push(m); return `\u0000${kept.length - 1}\u0000` }
  s = s.replace(/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b|\b(?:19|20)\d{2}\b(?!\d|,\d)/g, keep)
  if (opts.allNumbers) s = s.replace(DAY_MONTH, keep).replace(/\d+(?:\.\d+)?\s?(?:%|percent\b)/gi, keep)
  // Contact details and long numbers: accounts, cards, IBANs, phones
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '***')
  s = s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '***')                         // IBAN
  s = s.replace(/(?:\+?\d[\d\s-]{7,}\d)/g, m => (m.replace(/\D/g, '').length >= 8 ? '***' : m))
  // Amounts: with a currency, with lakh/crore/K, grouped with commas, or 4+ digits
  const tok = (m: string) => vault.amount(m, amountValue(m))
  s = s.replace(MONEY_SYM, tok).replace(MONEY_WORD, tok).replace(GROUPED, tok).replace(BIG, tok)
  if (opts.allNumbers) s = s.replace(/(?<![\w.\u0000])\d+(?:\.\d+)?(?![\w\u0000])/g, tok)
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)])
  // Names, longest first so "HDFC NRE Savings" goes before "HDFC Bank"
  for (const n of Array.from(new Set(names.map(x => String(x ?? '').trim()).filter(x => x.length >= 3))).sort((a, b) => b.length - a.length))
    s = s.replace(new RegExp(`(?<![\\w])${esc(n)}(?![\\w])`, 'gi'), '***')
  return s
}

// The names to hide: you, your family, and every bank, account and card name
export function namesToHide(p: { fullName?: string | null; members?: { name?: string | null }[]; accounts?: any[]; loans?: any[]; holders?: (string | null)[] }) {
  const out: string[] = []
  const full = String(p.fullName ?? '').trim()
  if (full) out.push(full, ...full.split(/\s+/))
  for (const m of p.members ?? []) if (m?.name) out.push(m.name, ...String(m.name).split(/\s+/))
  for (const a of p.accounts ?? []) { if (a?.name) out.push(a.name); if (a?.bank_name) out.push(a.bank_name) }
  for (const l of p.loans ?? []) { if (l?.name) out.push(l.name); if (l?.bank_name) out.push(l.bank_name) }
  for (const h of p.holders ?? []) if (h && h !== 'Self') out.push(h)
  return out
}

// A form field Claude filled with a placeholder → the real number (or its own number)
export function numberBack(v: unknown, vault: Vault): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s || s === 'null') return null
  const t = s.match(/\[A\d+\]/)?.[0]
  if (t) return vault.value(t)
  const n = amountValue(s)
  return n != null && Number.isFinite(n) ? n : null
}

// The rule Claude is given with every request
export const PRIVACY_RULES = `Privacy rules for this conversation:
- Amounts are hidden as placeholders like [A1]. You don't know their values and must not guess them. To mention one, write the placeholder exactly (e.g. "your net worth [A1]"); the app shows the real figure to the user.
- Never do arithmetic on placeholders. Work from the percentages, ratios, months and trends you're given.
- *** is a hidden name or number. Don't ask for it and don't try to work it out.`

// The AI switch and the separate one for photos (a photo can't be masked)
export const aiSettingsOf = (meta: any) => ({ on: meta?.ai === 'on', photos: meta?.ai === 'on' && meta?.ai_photos === 'on' })
export const AI_OFF = { error: 'AI is off', details: 'AI is switched off. Turn it on in Settings › AI & privacy.' }
export const PHOTOS_OFF = { error: 'Photo reading is off', details: 'Reading bill photos sends the picture, which shows the amount, so it is off. Turn it on in Settings › AI & privacy, or add the bill by hand.' }
