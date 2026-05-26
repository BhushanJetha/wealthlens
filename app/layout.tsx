import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'WealthLens — Personal Finance OS',
  description: 'Unified personal finance dashboard for UAE & India',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`} style={{ background: '#FFFFFF', color: 'var(--text)' }}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
