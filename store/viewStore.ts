import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  setDateRange: (from: string, to: string) => void
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      view: 'consolidated',
      setView: (view) => set({ view }),
      fxRate: 22.80,
      setFxRate: (fxRate) => set({ fxRate }),
      fromMonth: currentMonth(),
      toMonth: currentMonth(),
      setDateRange: (fromMonth, toMonth) => set({ fromMonth, toMonth }),
    }),
    {
      name: 'wealthlens-view',
      // The UAE / India / All choice is remembered; the period isn't. The app
      // always opens on the current month, and another month lasts while you use it.
      partialize: (s) => ({ view: s.view, fxRate: s.fxRate }),
      merge: (saved: any, current) => ({ ...current, view: saved?.view ?? current.view, fxRate: saved?.fxRate ?? current.fxRate }),
    }
  )
)
