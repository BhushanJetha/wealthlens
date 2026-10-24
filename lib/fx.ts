// Live AED→INR rate (server side). Shared by /api/fx-rate and server pages
// (e.g. the Home net-worth snapshot) so everything converts at the same rate.
export const FALLBACK_AED_INR = 22.80

export async function getAedInr(): Promise<{ rate: number; date: string | null; live: boolean }> {
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
        return { rate: Number(rate), date: data.date ?? new Date().toISOString().slice(0, 10), live: true }
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
        return { rate: Number(rate), date: data.date ?? null, live: true }
      }
    }
  } catch {}

  // Hard fallback
  return { rate: FALLBACK_AED_INR, date: null, live: false }
}
