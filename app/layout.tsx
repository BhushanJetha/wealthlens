import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'WealthLens — Personal Finance OS',
  description: 'Unified personal finance dashboard for UAE & India',
  applicationName: 'WealthLens',
  icons: {
    icon: '/brand/logo.svg',
    apple: '/brand/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'WealthLens',
    statusBarStyle: 'default',
    // iPhone's launch screen, one image per screen size (public/launch)
    startupImage: [
      { url: '/launch/1320x2868.png', media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1206x2622.png', media: '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/launch/828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/launch/750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/launch/1242x2208.png', media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // let content extend into safe areas; we pad with env(safe-area-inset-*)
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`} style={{ background: '#FFFFFF', color: 'var(--text)' }}>
        {/* Opening the installed app: the brand for a moment, then Home. Only in
            the app and once per launch; CSS alone, so it can't hold the page up. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if((matchMedia('(display-mode: standalone)').matches||navigator.standalone)&&!sessionStorage.getItem('wl-splash')){sessionStorage.setItem('wl-splash','1');document.documentElement.classList.add('wl-splash')}}catch(e){}` }} />
        <div id="wl-splash" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon-512.png" alt="" width={96} height={96} />
          <strong>WealthLens</strong>
          <span>Your money, UAE &amp; India</span>
        </div>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
