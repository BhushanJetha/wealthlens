import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type View = 'uae' | 'india' | 'consolidated'

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
      fromMonth: new Date().toISOString().slice(0, 7),
      toMonth: new Date().toISOString().slice(0, 7),
      setDateRange: (fromMonth, toMonth) => set({ fromMonth, toMonth }),
    }),
    { name: 'wealthlens-view' }
  )
)
