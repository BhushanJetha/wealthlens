import { NextRequest, NextResponse } from 'next/server'

const CACHE    = new Map<string, { data: Record<string, unknown>; ts: number }>()
const HIS_CACHE = new Map<string, { data: any[]; ts: number }>()
const TTL     = 3 * 60 * 60 * 1000  // 3 hours for latest NAV
const HIS_TTL = 24 * 60 * 60 * 1000 // 24 hours for historical (past NAVs don't change)

export async function GET(req: NextRequest) {
  const q          = req.nextUrl.searchParams.get('q')
  const schemeCode = req.nextUrl.searchParams.get('schemeCode')
  const months     = req.nextUrl.searchParams.get('months') // historical: last N months

  // Search
  if (q) {
    try {
      const res  = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(6000) })
      const data = await res.json()
      return NextResponse.json(data)
    } catch {
      return NextResponse.json([], { status: 200 })
    }
  }

  if (!schemeCode) return NextResponse.json({ error: 'schemeCode or q required' }, { status: 400 })

  // Historical NAV for MoM/YoY chart
  if (months) {
    const cacheKey = `${schemeCode}-his-${months}`
    const hit = HIS_CACHE.get(cacheKey)
    if (hit && Date.now() - hit.ts < HIS_TTL) return NextResponse.json({ data: hit.data })

    try {
      const res  = await fetch(`https://api.mfapi.in/mf/${schemeCode}`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`MFAPI ${res.status}`)
      const json = await res.json()
      const allData: Array<{ date: string; nav: string }> = json?.data ?? []

      // Keep one entry per month (last day of each month) for last N months
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - Number(months))
      const cutoffStr = cutoff.toISOString().slice(0, 10).split('-').reverse().join('-') // DD-MM-YYYY format

      const monthly: Record<string, { date: string; nav: number }> = {}
      allData.forEach(d => {
        if (d.date < cutoffStr) return // MFAPI uses DD-MM-YYYY, skip old
        const [dd, mm, yyyy] = d.date.split('-')
        const monthKey = `${yyyy}-${mm}`
        if (!monthly[monthKey]) monthly[monthKey] = { date: d.date, nav: Number(d.nav) }
      })

      const result = Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, nav: v.nav, date: v.date }))

      HIS_CACHE.set(cacheKey, { data: result, ts: Date.now() })
      return NextResponse.json({ data: result })
    } catch {
      const stale = HIS_CACHE.get(cacheKey)
      if (stale) return NextResponse.json({ data: stale.data, stale: true })
      return NextResponse.json({ data: [] })
    }
  }

  // Latest NAV
  const hit = CACHE.get(schemeCode)
  if (hit && Date.now() - hit.ts < TTL) return NextResponse.json(hit.data)

  try {
    const res  = await fetch(`https://api.mfapi.in/mf/${schemeCode}/latest`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`MFAPI ${res.status}`)
    const data = await res.json()
    CACHE.set(schemeCode, { data, ts: Date.now() })
    return NextResponse.json(data)
  } catch {
    const stale = CACHE.get(schemeCode)
    if (stale) return NextResponse.json({ ...stale.data, stale: true })
    return NextResponse.json({ error: 'NAV unavailable' }, { status: 503 })
  }
}
