import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MODEL, aiConfigured, aiErrorResponse } from '@/lib/ai/claude'
import { CLS_LABEL } from '@/lib/portfolio/advice'
import type { ReviewData } from '@/lib/portfolio/review'
import type { Cls } from '@/lib/portfolio/holdings'

const SYSTEM = `You are a careful portfolio analyst for an Indian living in the UAE (an NRI) with money in both India (₹) and the UAE (AED).
You check a rules-based portfolio review against TODAY's market, using web search — never from memory.
Educational guidance only, not licensed advice. Never suggest buying individual company shares. Never invent numbers: every market figure must come from a search result.
Be plain and specific. If the market supports a suggestion, say so; if it argues for caution or for spreading purchases over time (e.g. SIPs over 6–12 months), say why.`

// Adds an AI market view to a saved review: Claude searches today's news
// (Indian valuations, RBI rates, gold, the rupee, global markets) and checks
// the review's suggestions against it, with sources. Only with a real key.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!aiConfigured()) return NextResponse.json({ error: 'AI service not configured', details: 'Add a real ANTHROPIC_API_KEY to .env.local and restart the dev server.' }, { status: 503 })
  const { id } = await req.json().catch(() => ({}))
  const { data: row } = await supabase.from('portfolio_reviews').select('id,data').eq('user_id', user.id).eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  const r = row.data as ReviewData
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const brief = [
    `Review: ${r.label}. Profile: ${r.mix.profile ?? 'not set'}.`,
    `Mix now vs target: ${(['equity', 'debt', 'gold', 'cash'] as Cls[]).map(c => `${CLS_LABEL[c]} ${Math.round(r.mix.now[c])}% (target ${r.mix.target[c]}%)`).join(', ')}.`,
    `Split: ${Math.round(r.currency.aedPct)}% in AED, ${Math.round(r.currency.inrPct)}% in ₹.`,
    `Suggested additions: ${r.adds.map(a => `${a.title} (${a.amount.toFixed(0)} ${a.currency}; examples: ${a.examples.slice(0, 3).map(e => e.name).join(', ')})`).join('; ') || 'none'}.`,
    `Holdings flagged: ${r.holdings.filter(h => h.verdict !== 'keep').slice(0, 12).map(h => `${h.name} — ${h.verdict}`).join('; ') || 'none'}.`,
  ].join('\n')
  const ask = `${brief}

Today is ${today}. Search the web for the current state of: Indian equity valuations (e.g. Nifty 50 P/E vs its history), the RBI's interest-rate stance and what it means for debt funds and FDs, the gold price trend, the rupee against the dirham/dollar, and global equity markets.
Then reply EXACTLY in this format and nothing else:
SUMMARY: <two or three sentences on what today's market means for this portfolio>
- <short title>: <one or two sentences, with the figure and what to do about the suggestion>
Give 4 to 6 bullet lines.`

  try {
    const client = new Anthropic()
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: ask }]
    let res: Anthropic.Message | null = null
    // Long searches can pause; resend the turn so the server resumes it
    for (let i = 0; i < 4; i++) {
      res = await client.messages.create({
        model: MODEL, max_tokens: 6000, thinking: { type: 'adaptive' }, system: SYSTEM, messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      })
      if (res.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: res.content })
    }
    if (!res || res.stop_reason === 'refusal') return NextResponse.json({ error: 'Request declined' }, { status: 422 })
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim()
    const sources: { title: string; url: string }[] = []
    for (const m of [...messages.filter(m => m.role === 'assistant').flatMap(m => (Array.isArray(m.content) ? m.content : [])), ...res.content] as any[])
      if (m?.type === 'web_search_tool_result' && Array.isArray(m.content))
        for (const s of m.content) if (s?.url && !sources.some(x => x.url === s.url)) sources.push({ title: String(s.title ?? s.url).slice(0, 80), url: s.url })
    const summary = text.match(/SUMMARY:\s*([\s\S]*?)(?:\n\s*-|$)/)?.[1]?.trim() ?? text.split('\n')[0]
    const points = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('- ')).map(l => {
      const body = l.slice(2), i = body.indexOf(':')
      return i > 0 && i < 60 ? { title: body.slice(0, i).trim(), detail: body.slice(i + 1).trim() } : { title: 'Note', detail: body }
    }).slice(0, 6)
    const market_view = { asOf: today, summary, points, sources: sources.slice(0, 8) }
    await supabase.from('portfolio_reviews').update({ market_view }).eq('id', row.id)
    return NextResponse.json({ ok: true, market_view })
  } catch (err) {
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
