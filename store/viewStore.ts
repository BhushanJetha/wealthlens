import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { rangeOf, isPeriod, PERIOD_KEY, type PeriodKey, type Compare } from '@/lib/period'

type View = 'uae' | 'india' | 'consolidated'

// This month on the phone's own clock (the 1st starts at local midnight, not UTC's)
export const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface ViewStore {
  view: View
  setView: (v: View) => void
  fxRate: number
  setFxRate: (r: number) => void
  fromMonth: string
  toMonth: string
  // One period for every page that looks back. A preset ("Last 6 months")
  // rolls with time; months picked by hand are `period: null`.
  period: PeriodKey | null
  lastPreset: PeriodKey
  compare: Compare
  setDateRange: (from: string, to: string) => void
  setPeriod: (p: PeriodKey) => void
  setCompare: (c: Compare) => void
}
// A saved preset's months, as of today
const presetRange = (p: PeriodKey) => rangeOf(p, currentMonth())
// Before one period for everything, Home kept its own choice: start from it
const oldHome = (): PeriodKey | null => { try { const s = localStorage.getItem(PERIOD_KEY); return isPeriod(s) ? s : null } catch { return null } }

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      view: 'consolidated',
      setView: (view) => set({ view }),
      fxRate: 22.80,
      setFxRate: (fxRate) => set({ fxRate }),
      fromMonth: currentMonth(),
      toMonth: currentMonth(),
      period: 'this',
      lastPreset: 'this',
      compare: 'prev',
      setDateRange: (fromMonth, toMonth) => set({ fromMonth, toMonth, period: null }),
      setPeriod: (period) => { const [fromMonth, toMonth] = presetRange(period); set({ period, lastPreset: period, fromMonth, toMonth }) },
      setCompare: (compare) => set({ compare }),
    }),
    {
      name: 'wealthlens-view',
      // The UAE / India / All choice and a period preset are remembered (the
      // preset's months move on with time). Months picked by hand last while
      // you use the app; it opens again on the preset you had.
      partialize: (s) => ({ view: s.view, fxRate: s.fxRate, period: s.period ?? s.lastPreset, compare: s.compare }),
      merge: (saved: any, current) => {
        const period: PeriodKey = isPeriod(saved?.period) ? saved.period : oldHome() ?? 'this'
        const [fromMonth, toMonth] = presetRange(period)
        return { ...current, view: saved?.view ?? current.view, fxRate: saved?.fxRate ?? current.fxRate, period, lastPreset: period, fromMonth, toMonth,
          compare: saved?.compare === 'yoy' || saved?.compare === 'none' ? saved.compare : 'prev' }
      },
    }
  )
)
