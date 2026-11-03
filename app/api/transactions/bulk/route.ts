import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rejectAuto } from '@/lib/autoEntries'
import { accountPatch, categoryPatch, groupPatches, type CatKind } from '@/lib/bulk'
import { ruleTextFor } from '@/lib/rules'

const MAX = 1000

// POST /api/transactions/bulk — change or delete many of your transactions at once
// { ids, action: 'category', category, kind, remember? } · { ids, action: 'account', account_id } · { ids, action: 'delete' }
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, MAX) : []
  if (!ids.length) return NextResponse.json({ error: 'Nothing selected' }, { status: 400 })

  // Only your own rows, whatever ids were sent
  const { data: rows, error } = await supabase.from('transactions').select('*').eq('user_id', user.id).in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const mine = rows ?? []

  if (body.action === 'delete') {
    let deleted = 0
    // An entry the app made (SIP, EMI…): the units or loan payment go with it
    for (const t of mine.filter(t => t.auto_ref)) {
      const err = await rejectAuto(supabase, t)
      if (err) return NextResponse.json({ error: err, deleted }, { status: 500 })
      deleted++
    }
    const plain = mine.filter(t => !t.auto_ref).map(t => t.id)
    if (plain.length) {
      const { error: e } = await supabase.from('transactions').delete().eq('user_id', user.id).in('id', plain)
      if (e) return NextResponse.json({ error: e.message, deleted }, { status: 500 })
      deleted += plain.length
    }
    return NextResponse.json({ deleted, skipped: ids.length - mine.length })
  }

  let plan
  if (body.action === 'category') {
    const kind: CatKind = body.kind === 'income' ? 'income' : 'expense'
    const category = String(body.category ?? '').trim()
    if (!category) return NextResponse.json({ error: 'Pick a category' }, { status: 400 })
    plan = groupPatches(mine, t => categoryPatch(t, category, kind))
  } else if (body.action === 'account') {
    const { data: acc } = await supabase.from('accounts').select('id,currency').eq('user_id', user.id).eq('id', String(body.account_id ?? '')).maybeSingle()
    if (!acc) return NextResponse.json({ error: 'Pick an account' }, { status: 400 })
    plan = groupPatches(mine, t => accountPatch(t, acc))
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  let updated = 0
  for (const g of plan.groups) {
    const { error: e } = await supabase.from('transactions').update(g.patch).eq('user_id', user.id).in('id', g.ids)
    if (e) return NextResponse.json({ error: e.message, updated }, { status: 500 })
    updated += g.ids.length
  }

  // "Always do this": new rows from these merchants get the category too (migration 027)
  let remembered = 0
  if (body.action === 'category' && body.remember) {
    const { data: have } = await supabase.from('txn_rules').select('match_text').eq('user_id', user.id)
    const known = new Set((have ?? []).map((r: any) => r.match_text))
    const keys = new Map<string, string>()
    for (const t of mine) { const k = ruleTextFor(t.merchant); if (k && !known.has(k) && !keys.has(k)) keys.set(k, String(t.merchant ?? '').trim()) }
    if (keys.size) {
      const { error: e } = await supabase.from('txn_rules').insert(Array.from(keys, ([k, label]) => ({ user_id: user.id, match_text: k, label, set_category: String(body.category) })))
      if (!e) remembered = keys.size
    }
  }
  return NextResponse.json({ updated, skipped: plan.skipped + (ids.length - mine.length), remembered })
}
