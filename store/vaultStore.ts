import { create } from 'zustand'

// The unlocked vault key lives only in memory (never persisted) and locks
// itself after 5 minutes without use, or when the user locks it.
const IDLE_MS = 5 * 60 * 1000
let timer: ReturnType<typeof setTimeout> | null = null

interface VaultState {
  key: CryptoKey | null
  unlock: (key: CryptoKey) => void
  touch: () => void
  lock: () => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  key: null,
  unlock: (key) => { set({ key }); get().touch() },
  touch: () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => get().lock(), IDLE_MS)
  },
  lock: () => { if (timer) clearTimeout(timer); timer = null; set({ key: null }) },
}))
