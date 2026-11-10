import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { amfiNavs, matchScheme } from '@/lib/amfi'
import { quoteFor } from '@/lib/stockQuote'

// Refresh what your funds and shares are worth, and save it:
//   funds  — the NAV from AMFI (the official daily file), matched by the
//            fund's scheme code, its ISIN or, only when it's clear, its name.
//            A fund that can't be matched comes back with the closest schemes
//            for you to pick; its saved NAV is left alone.
//   shares — the latest price (lib/stockQuote).
// POST { kind: 'mf' | 'stock' | 'etf', ids?: string[] }
type Out = { id: string; ok: boolean; price?: number; date?: string | null; code?: number; scheme?: string; how?: string | null; ticker?: string; candidates?: any[]; error?: string }

// Write, leaving out any column a migration hasn't added yet (048: nav_date, scheme_name)
async function save(sb: any, table: string, id: string, patch: Record<string, any>) {
  let p = { ...patch }
  for (let t = 0; t < 4; t++) {
    const { error } = await sb.from(table).update(p).eq('id', id)
    if (!error) return
    const col = error.message?.match(/'([a-zA-Z_]+)' column/)?.[1] ?? error.message?.match(/column "?([a-zA-Z_]+)"?/i)?.[1]
    if (!col || !(col in p)) return
    delete p[col]
  }
}

export async function POST(req: Request) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const kind = body.kind === 'stock' || body.kind === 'etf' ? body.kind : 'mf'
  const ids: string[] | null = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 200) : null
  const table = kind === 'mf' ? 'mutual_funds' : kind === 'stock' ? 'stocks' : 'etf_investments'
  let q = sb.from(table).select('*').eq('user_id', user.id)
  if (ids?.length) q = q.in('id', ids)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const now = new Date().toISOString(), out: Out[] = []

  if (kind === 'mf') {
    const amfi = await amfiNavs()
    if (!amfi) return NextResponse.json({ error: 'AMFI’s NAV file couldn’t be reached just now. Try again in a minute.' }, { status: 503 })
    for (const f of rows ?? []) {
      const m = matchScheme(amfi, f)
      if (!m.scheme) {
        out.push({ id: f.id, ok: false, candidates: m.candidates.map(s => ({ code: s.code, name: s.name, plan: s.plan, option: s.optionText || s.option, nav: s.nav, date: s.date })) })
        continue
      }
      const s = m.scheme
      await save(sb, 'mutual_funds', f.id, { current_nav: s.nav, nav_date: s.date || null, scheme_code: s.code,
        scheme_name: [s.name, s.plan === 'direct' ? 'Direct' : s.plan === 'regular' ? 'Regular' : null, s.optionText || null].filter(Boolean).join(' · '), last_updated: now })
      out.push({ id: f.id, ok: true, price: s.nav, date: s.date || null, code: s.code, scheme: s.name, how: m.how })
    }
  } else {
    await Promise.all((rows ?? []).map(async (r: any) => {
      if (!r.symbol) { out.push({ id: r.id, ok: false, error: 'No symbol saved' }); return }
      const qt = await quoteFor(String(r.symbol)).catch(() => null)
      if (!qt || !(Number(qt.price) > 0)) { out.push({ id: r.id, ok: false, error: 'No price found for this symbol' }); return }
      await save(sb, table, r.id, { current_price: Number(qt.price), last_updated: now })
      out.push({ id: r.id, ok: true, price: Number(qt.price), date: (qt.at as string | null) ?? now, ticker: String(qt.symbol) })
    }))
  }
  return NextResponse.json({ results: out, at: now })
}
