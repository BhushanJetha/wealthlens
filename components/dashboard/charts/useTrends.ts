'use client'
// Home's month-by-month trends (/api/home/trends, lib/homeTrends), read once per
// page: 25 months covers a period and the one before it; two years needs more.
import { useEffect, useState } from 'react'
import type { Trends } from '@/lib/homeTrends'

export function useTrends(need: number): { data: Trends | null; failed: boolean; retry: () => void } {
  const [data, setData] = useState<Trends | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (data && data.months.length >= need) return
    let off = false
    setFailed(false)
    fetch(`/api/home/trends?months=${need}`).then(r => (r.ok ? r.json() : Promise.reject())).then(d => { if (!off) setData(d) }, () => { if (!off) setFailed(true) })
    return () => { off = true }
  }, [need, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, failed, retry: () => { setData(null); setTick(t => t + 1) } }
}
