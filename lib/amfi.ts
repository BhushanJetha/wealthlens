// Mutual fund NAVs from AMFI — the official daily file every fund house
// reports to, so the same NAV you'd see in any app. A scheme's NAV is the
// same everywhere for a date; apps differ only when they show a different
// variant of the fund (Direct or Regular plan, Growth or IDCW option) or an
// older date. NAVs come out once a day, in the evening (India time), for that
// working day. Server side only.
export interface AmfiScheme {
  code: number; isins: string[]; name: string; amc: string
  plan: 'direct' | 'regular' | null; option: 'growth' | 'idcw' | null; optionText: string
  nav: number; date: string            // YYYY-MM-DD
}
export interface AmfiData { at: number; list: AmfiScheme[]; byCode: Map<number, AmfiScheme>; byIsin: Map<string, AmfiScheme> }

const URLS = ['https://portal.amfiindia.com/spages/NAVAll.txt', 'https://www.amfiindia.com/spages/NAVAll.txt']
const TTL = 60 * 60 * 1000
let cache: AmfiData | null = null
const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
const isoOf = (d: string) => { const m = d.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); return m ? `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}` : '' }

export const planOf = (s: string): AmfiScheme['plan'] => /\bdirect\b|\bdir\b/i.test(s) ? 'direct' : /\bregular\b|\breg\b/i.test(s) ? 'regular' : null
export const optionOf = (s: string): AmfiScheme['option'] => /idcw|dividend|payout|reinvest|bonus/i.test(s) ? 'idcw' : /growth|\bgr\b|cumulative/i.test(s) ? 'growth' : null

export function parseNavAll(text: string): AmfiData {
  const lines = text.split(/\r?\n/)
  const head = (lines[0] ?? '').split(';').map(x => x.trim().toLowerCase())
  const wide = head.includes('plan')            // newer file: Plan and Option in their own columns
  const list: AmfiScheme[] = []
  let amc = ''
  for (const raw of lines.slice(1)) {
    const line = raw.trim()
    if (!line) continue
    if (!line.includes(';')) { if (!/^(open|close|interval)\s+ended/i.test(line)) amc = line; continue }
    const f = line.split(';').map(x => x.trim())
    const code = Number(f[0])
    if (!code) continue
    const [name, planText, optText, navText, dateText] = wide ? [f[3], f[4], f[5], f[6], f[7]] : [f[3], f[3], f[3], f[4], f[5]]
    const nav = Number(navText)
    if (!(nav > 0)) continue
    list.push({ code, isins: [f[1], f[2]].filter(x => x && x !== '-'), name, amc, plan: planOf(planText) ?? planOf(name), option: optionOf(optText) ?? optionOf(name),
      optionText: wide ? optText : '', nav, date: isoOf(dateText ?? '') })
  }
  const byCode = new Map(list.map(s => [s.code, s] as const))
  const byIsin = new Map<string, AmfiScheme>()
  for (const s of list) for (const i of s.isins) byIsin.set(i.toUpperCase(), s)
  return { at: Date.now(), list, byCode, byIsin }
}

export async function amfiNavs(): Promise<AmfiData | null> {
  if (cache && Date.now() - cache.at < TTL) return cache
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' })
      if (!res.ok) continue
      const data = parseNavAll(await res.text())
      if (data.list.length > 1000) { cache = data; return data }
    } catch { continue }
  }
  return cache        // the last good copy, if any
}

// ── Finding the scheme for a fund you hold ──────────────────────────────────
const STOP = new Set(['fund', 'plan', 'option', 'direct', 'regular', 'growth', 'idcw', 'dividend', 'payout', 'reinvestment', 'reinvest', 'the', 'of', 'and',
  'mutual', 'scheme', 'an', 'open', 'ended', 'dir', 'reg', 'gr', 'formerly', 'known', 'as', 'cumulative', 'monthly', 'quarterly', 'annual', 'weekly', 'daily'])
const tokens = (s: string) => new Set(String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .split(' ').filter(w => w.length > 1 && !STOP.has(w)))
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let both = 0
  a.forEach(w => { if (b.has(w)) both++ })
  return both / (a.size + b.size - both)
}

export interface SchemeMatch { scheme: AmfiScheme | null; how: 'code' | 'isin' | 'name' | null; candidates: AmfiScheme[] }
// By its scheme code, else its ISIN (from a CAS statement), else its name —
// by name only when the plan (Direct / Regular) is clear and one scheme fits
// clearly better than the rest; otherwise the closest few are returned for you to pick.
export function matchScheme(data: AmfiData, f: { fund_name?: string | null; scheme_code?: number | string | null; isin?: string | null }): SchemeMatch {
  const code = Number(f.scheme_code) || 0
  if (code && data.byCode.has(code)) return { scheme: data.byCode.get(code)!, how: 'code', candidates: [] }
  const isin = String(f.isin ?? '').trim().toUpperCase()
  if (isin && data.byIsin.has(isin)) return { scheme: data.byIsin.get(isin)!, how: 'isin', candidates: [] }
  const name = String(f.fund_name ?? '')
  const want = tokens(name), plan = planOf(name), option = optionOf(name) ?? 'growth'
  const scored = data.list
    .filter(s => (!plan || s.plan === plan) && (s.option ?? 'growth') === option)
    .map(s => ({ s, score: similarity(want, tokens(s.name)) }))
    .filter(x => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
  const top = scored[0], next = scored.find(x => x.s.name !== top?.s.name || x.s.plan !== top?.s.plan)
  const clear = !!top && top.score >= 0.6 && (!next || next.score <= top.score - 0.15)
  // Same scheme, several daily IDCW / bonus rows: one Growth row is what's meant
  const sameScheme = scored.filter(x => top && x.s.name === top.s.name && x.s.plan === top.s.plan)
  const unique = sameScheme.length === 1
  const candidates = scored.slice(0, 6).map(x => x.s)
  return plan && clear && unique ? { scheme: top.s, how: 'name', candidates: [] } : { scheme: null, how: null, candidates }
}
