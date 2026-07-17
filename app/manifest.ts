import type { MetadataRoute } from 'next'

// PWA manifest — makes WealthLens installable to the phone home screen and
// launch full-screen (standalone) like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WealthLens — Personal Finance OS',
    short_name: 'WealthLens',
    description: 'Unified personal finance dashboard for UAE & India',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#16A34A',
    categories: ['finance', 'productivity'],
    // Android share sheet: "Share → WealthLens" a bank SMS/alert opens the
    // Expenses page with ?text=… and auto-opens the message parser.
    // (Cast: Next's manifest type mistypes share_target.params; the emitted
    // JSON follows the W3C Web Share Target shape.)
    share_target: {
      action: '/dashboard/expenses',
      method: 'get',
      params: { title: 'title', text: 'text', url: 'url' },
    } as any,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
