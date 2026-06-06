import { NextRequest, NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'

interface NewsItem { title: string; link: string; pubDate: string; source: string; topic: string; description: string }

// Google News RSS — works server-side without auth, updates frequently
const FEEDS = [
  { url: 'https://news.google.com/rss/search?q=mutual+fund+India+NAV+SIP+SEBI&hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', topic: 'mf' },
  { url: 'https://news.google.com/rss/search?q=NSE+BSE+Nifty+Sensex+stocks+India&hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', topic: 'stocks' },
  { url: 'https://news.google.com/rss/search?q=Indian+economy+RBI+finance+market&hl=en-IN&gl=IN&ceid=IN:en', source: 'Google News', topic: 'general' },
]

let _cache: { data: NewsItem[]; ts: number } | null = null
const TTL = 20 * 60 * 1000 // 20 minutes

const HOUR = 60 * 60 * 1000
// Progressive recency windows (ms). Start at ~48h and relax if too few articles remain.
const RECENCY_WINDOWS = [48 * HOUR, 5 * 24 * HOUR, 14 * 24 * HOUR]
const MIN_RECENT = 5
const MAX_ARTICLES = 12

async function fetchFeed(url: string, source: string, topic: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<item')) {
    throw new Error(`Non-RSS response from ${url}: ${text.slice(0, 100)}`)
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const parsed = parser.parse(text)

  // Google News uses Atom-like structure sometimes
  const channel = parsed?.rss?.channel
  const items: any[] = Array.isArray(channel?.item) ? channel.item : channel?.item ? [channel.item] : []

  return items.slice(0, 20).map(item => {
    const rawLink = String(item.link ?? item.guid ?? '')
    // Google News wraps links — extract readable URL from guid if available
    const link = rawLink.startsWith('http') ? rawLink : String(item['@_href'] ?? rawLink)
    return {
      title:   String(item.title ?? '').replace(/<[^>]+>/g, '').trim(),
      link,
      pubDate: String(item.pubDate ?? item.published ?? '').trim(),
      source:  item.source?.['#text'] ?? source,
      topic,
      description: String(item.description ?? item.summary ?? item['content:encoded'] ?? '').replace(/<[^>]+>/g, '').trim(),
    }
  }).filter(a => a.title.length > 5)
}

// Sort newest first; treat unparseable/missing dates as oldest.
function sortNewestFirst(arr: NewsItem[]): NewsItem[] {
  return [...arr].sort((a, b) => {
    const ta = new Date(a.pubDate).getTime()
    const tb = new Date(b.pubDate).getTime()
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta)
  })
}

// Keep articles within a progressively relaxed recency window so the feed is never
// empty when upstream has data. Articles with unparseable dates are retained as a
// fallback (they don't reduce the recent count, but remain available downstream).
function applyRecency(sorted: NewsItem[]): NewsItem[] {
  const now = Date.now()
  const dated = sorted.filter(a => !isNaN(new Date(a.pubDate).getTime()))

  if (dated.length === 0) return sorted

  for (const win of RECENCY_WINDOWS) {
    const recent = dated.filter(a => now - new Date(a.pubDate).getTime() <= win)
    if (recent.length >= MIN_RECENT) return recent
  }
  // Even the widest window left fewer than MIN_RECENT — just return everything we have.
  return sorted
}

function dedupe(arr: NewsItem[]): NewsItem[] {
  const seenTitle = new Set<string>()
  const seenLink = new Set<string>()
  const out: NewsItem[] = []
  for (const a of arr) {
    const titleKey = a.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)
    const linkKey = a.link.trim()
    if (titleKey && seenTitle.has(titleKey)) continue
    if (linkKey && seenLink.has(linkKey)) continue
    if (titleKey) seenTitle.add(titleKey)
    if (linkKey) seenLink.add(linkKey)
    out.push(a)
  }
  return out
}

function parseTerms(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 2)
}

// Build the final list: optionally rank by relevance to the user's holding terms,
// then top up with general topic articles so the list stays full (~MAX_ARTICLES).
function buildArticles(pool: NewsItem[], terms: string[]): NewsItem[] {
  let ordered: NewsItem[]
  if (terms.length === 0) {
    ordered = pool
  } else {
    const matched: NewsItem[] = []
    const rest: NewsItem[] = []
    for (const a of pool) {
      const hay = `${a.title} ${a.description}`.toLowerCase()
      if (terms.some(t => hay.includes(t))) matched.push(a)
      else rest.push(a)
    }
    // Matched articles first; always append the remaining (recency-filtered) general
    // topic articles so the list stays full even when few/none of the terms match.
    ordered = matched.concat(rest)
  }
  return dedupe(ordered).slice(0, MAX_ARTICLES)
}

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get('topic') // 'mf' | 'stocks' | null
  const terms = parseTerms(req.nextUrl.searchParams.get('terms'))

  // Serve from cache when warm.
  if (_cache && Date.now() - _cache.ts < TTL) {
    const scoped = topic ? _cache.data.filter(a => a.topic === topic || a.topic === 'general') : _cache.data
    const recent = applyRecency(sortNewestFirst(scoped))
    return NextResponse.json({ articles: buildArticles(recent, terms), cached: true })
  }

  let unique: NewsItem[] = []
  try {
    const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f.url, f.source, f.topic)))
    const allArticles: NewsItem[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        allArticles.push(...r.value)
      } else {
        console.warn(`[market-news] Feed ${FEEDS[i].url} failed:`, r.reason?.message)
      }
    })

    unique = dedupe(sortNewestFirst(allArticles))
    _cache = { data: unique, ts: Date.now() }
  } catch (err) {
    // Never throw — if everything failed, fall back to whatever cache we have, else empty.
    console.warn('[market-news] fetch failed:', (err as Error)?.message)
    if (_cache) unique = _cache.data
  }

  if (unique.length === 0) {
    return NextResponse.json({ articles: [] })
  }

  const scoped = topic ? unique.filter(a => a.topic === topic || a.topic === 'general') : unique
  const recent = applyRecency(sortNewestFirst(scoped))
  return NextResponse.json({ articles: buildArticles(recent, terms) })
}
