import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HolderStore {
  selectedHolder: string   // '' = all members, 'Self' or a family member name
  setSelectedHolder: (h: string) => void
}

export const useHolderStore = create<HolderStore>()(
  persist(
    (set) => ({
      selectedHolder: '',
      setSelectedHolder: (selectedHolder) => set({ selectedHolder }),
    }),
    { name: 'wealthlens-holder' }
  )
)
