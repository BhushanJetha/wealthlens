import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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
    // This visit only: a person picked last week shouldn't quietly hide everyone else's money
    { name: 'wealthlens-holder', storage: createJSONStorage(() => sessionStorage) }
  )
)
