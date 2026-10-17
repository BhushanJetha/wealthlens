import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Resolve a Pinterest pin link to its image (og:image) so it can be pinned to
// the Money Mindset board. Pinterest hosts only — this is not an open proxy.
const PIN_HOST = /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/i
const IMG_HOST = /(^|\.)pinimg\.com$/i

const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function metaContent(html: string, prop: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]*>`, 'i'))?.[0]
  const content = tag?.match(/content="([^"]*)"/i)?.[1]
  return content ? decode(content) : null
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let url: URL
  try { url = new URL(new URL(req.url).searchParams.get('url') || '') }
  catch { return NextResponse.json({ error: 'That doesn’t look like a link' }, { status: 400 }) }
  if (!['https:', 'http:'].includes(url.protocol)) return NextResponse.json({ error: 'Use an https link' }, { status: 400 })

  // Already a Pinterest image
  if (IMG_HOST.test(url.hostname)) return NextResponse.json({ image: url.toString(), title: null })
  if (!PIN_HOST.test(url.hostname)) {
    return NextResponse.json({ error: 'Paste a Pinterest pin link (pinterest.com/pin/… or pin.it/…)' }, { status: 400 })
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'facebookexternalhit/1.1', 'Accept-Language': 'en' },
      redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(10000),
    })
    // pin.it short links redirect — make sure we still ended up on Pinterest
    if (!PIN_HOST.test(new URL(res.url).hostname)) throw new Error('redirected off Pinterest')
    const html = (await res.text()).slice(0, 3_000_000)
    const image = metaContent(html, 'og:image')
    if (!image) return NextResponse.json({ error: 'Couldn’t find an image on that pin' }, { status: 422 })
    const title = metaContent(html, 'og:title')?.split('|')[0].trim() || null
    return NextResponse.json({ image, title, source: res.url })
  } catch {
    return NextResponse.json({ error: 'Couldn’t reach Pinterest — try again, or paste the image address instead' }, { status: 502 })
  }
}
