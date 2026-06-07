import { create } from 'zustand'

// Ephemeral UI state — currently the mobile sidebar drawer open/close.
interface UiState {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
