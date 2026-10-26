import { NextResponse } from 'next/server'
import { LOGO_DOMAINS } from '@/lib/banks'

// Bank logo for a known bank domain, fetched server-side and cached, so the
// browser only ever talks to this app. Unknown domains are refused (this is
// not an open image proxy).
export async function GET(req: Request) {
  const d = new URL(req.url).searchParams.get('d') ?? ''
  if (!LOGO_DOMAINS.has(d)) return new NextResponse('Unknown bank', { status: 404 })
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`, { next: { revalidate: 604800 } })
    if (!res.ok) return new NextResponse('No logo', { status: 404 })
    const type = res.headers.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/')) return new NextResponse('No logo', { status: 404 })
    return new NextResponse(await res.arrayBuffer(), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800, immutable' },
    })
  } catch {
    return new NextResponse('No logo', { status: 404 })
  }
}
