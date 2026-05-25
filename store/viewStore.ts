import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type View = 'uae' | 'india' | 'consolidated'

interface ViewStore {
  view: View
  setView: (v: View) => void
  fxRate: number
  setFxRate: (r: number) => void
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      view: 'consolidated',
      setView: (view) => set({ view }),
      fxRate: 22.80,
      setFxRate: (fxRate) => set({ fxRate }),
    }),
    { name: 'wealthlens-view' }
  )
)
