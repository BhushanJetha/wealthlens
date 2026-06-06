import { NextResponse } from 'next/server'

export async function GET() {
  // Primary: fawazahmed0 currency API (free, no key, comprehensive)
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/aed.json',
      { next: { revalidate: 3600 } }
    )
    if (res.ok) {
      const data = await res.json()
      const rate = data?.aed?.inr
      if (rate && Number(rate) > 1) {
        return NextResponse.json({
          rate: Number(rate),
          date: data.date ?? new Date().toISOString().slice(0, 10),
          live: true,
        })
      }
    }
  } catch {}

  // Fallback: exchangerate-api (free tier, no key for v4)
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/AED', {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.INR
      if (rate && Number(rate) > 1) {
        return NextResponse.json({
          rate: Number(rate),
          date: data.date ?? null,
          live: true,
        })
      }
    }
  } catch {}

  // Hard fallback
  return NextResponse.json({ rate: 22.80, date: null, live: false })
}
