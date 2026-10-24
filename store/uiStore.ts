import { create } from 'zustand'

// Ephemeral UI state — the mobile sidebar drawer, the Ctrl+K command palette,
// the statement-import modal and the AI advisor panel (openable from the
// Topbar, palette or Home; `advisorPrompt` auto-sends a question on open).
interface UiState {
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  uploadOpen: boolean
  setUploadOpen: (v: boolean) => void
  advisorOpen: boolean
  advisorPrompt: string | null
  openAdvisor: (prompt?: string) => void
  closeAdvisor: () => void
  clearAdvisorPrompt: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  uploadOpen: false,
  setUploadOpen: (v) => set({ uploadOpen: v }),
  advisorOpen: false,
  advisorPrompt: null,
  openAdvisor: (prompt) => set({ advisorOpen: true, advisorPrompt: prompt ?? null }),
  closeAdvisor: () => set({ advisorOpen: false }),
  clearAdvisorPrompt: () => set({ advisorPrompt: null }),
}))
