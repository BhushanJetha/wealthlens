import { create } from 'zustand'

// Ephemeral UI state — the mobile sidebar drawer, the Ctrl+K command palette and
// the statement-import modal (openable from the Topbar, palette or Home).
interface UiState {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  uploadOpen: boolean
  setUploadOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  uploadOpen: false,
  setUploadOpen: (v) => set({ uploadOpen: v }),
}))
