// Money formatting — INR uses Indian grouping (₹12,34,567 · 12.3L · 1.84Cr),
// AED uses international grouping (AED 1,234,567 · 12.3K · 1.25M).
export type Cur = 'AED' | 'INR'

export const symOf = (cur: string) => (cur === 'AED' ? 'AED ' : '₹')

export function fmtMoney(n: number, cur: string) {
  const v = Math.round(Math.abs(n) || 0).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')
  return `${n < 0 ? '−' : ''}${symOf(cur)}${v}`
}

export function fmtCompact(n: number, cur: string) {
  const a = Math.abs(n) || 0
  const sign = n < 0 ? '−' : ''
  const trim = (x: number, d: number) => x.toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
  let s: string
  if (cur === 'AED') s = a >= 1e6 ? `${trim(a / 1e6, 2)}M` : a >= 1e4 ? `${trim(a / 1e3, 1)}K` : Math.round(a).toLocaleString('en-US')
  else s = a >= 1e7 ? `${trim(a / 1e7, 2)}Cr` : a >= 1e5 ? `${trim(a / 1e5, 2)}L` : Math.round(a).toLocaleString('en-IN')
  return `${sign}${symOf(cur)}${s}`
}
