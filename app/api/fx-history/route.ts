import { NextResponse } from 'next/server'

// AED→INR history, sampled every ~6 days over the last ~90 days from the free
// fawazahmed0 currency API (same source as /api/fx-rate). One request per
// sampled date; failures are skipped so the chart degrades gracefully.
export async function GET() {
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const today = new Date()
  const dates: string[] = []
  for (let i = 90; i >= 0; i -= 6) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    dates.push(fmt(d))
  }

  async function rateOn(date: string, isLast: boolean): Promise<{ date: string; rate: number } | null> {
    const url = isLast
      ? 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aed.json'
      : `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/aed.json`
    try {
      const res = await fetch(url, { next: { revalidate: 21600 } })
      if (!res.ok) return null
      const data = await res.json()
      const rate = Number(data?.aed?.inr)
      if (rate > 1) return { date: data?.date ?? date, rate: Math.round(rate * 10000) / 10000 }
    } catch {}
    return null
  }

  const results = await Promise.all(dates.map((d, i) => rateOn(d, i === dates.length - 1)))
  const series = results.filter((r): r is { date: string; rate: number } => !!r)

  if (!series.length) {
    return NextResponse.json({ series: [], current: 22.80, avg: 22.80, min: 22.80, max: 22.80, live: false })
  }
  const rates = series.map(s => s.rate)
  const current = rates[rates.length - 1]
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length
  return NextResponse.json({
    series,
    current,
    avg: Math.round(avg * 10000) / 10000,
    min: Math.min(...rates),
    max: Math.max(...rates),
    live: true,
  })
}
