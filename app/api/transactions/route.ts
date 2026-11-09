import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadRules, applyRules } from '@/lib/rules'
import { rejectAuto } from '@/lib/autoEntries'
import { undoLinked } from '@/lib/linkTxn'

// Columns added by later migrations (026, 027, 034): a save still works before
// they're run — the missing one is dropped and the save retried
const OPTIONAL = ['counter_estimated', 'counter_amount', 'counter_account_id', 'payment_mode', 'holder_name', 'tax_tag', 'receipt_path', 'event_id']
const missingCol = (error: any, row: Record<string, any>) => OPTIONAL.find(c => c in row && String(error?.message ?? '').includes(c))

// GET /api/transactions — list user transactions with optional filters
export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const country  = searchParams.get('country')
  const category = searchParams.get('category')
  const month    = searchParams.get('month') // YYYY-MM
  const limit    = parseInt(searchParams.get('limit') ?? '200')

  let q = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('txn_date', { ascending: false })
    .limit(limit)

  if (country)  q = q.eq('country', country)
  if (category) q = q.eq('category', category)
  if (month)    q = q.gte('txn_date', `${month}-01`).lte('txn_date', `${month}-31`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data })
}

// POST /api/transactions — create a manual transaction
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { txn_date, merchant, description, category, sub_category, amount, currency, account_id, txn_type, counter_account_id, counter_amount, counter_estimated, payment_mode, holder_name, tax_tag, event_id, paid_by_friend_id } = body

  if (!txn_date || !merchant || !category || !amount || !currency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const country = currency === 'AED' ? 'UAE' : 'India'

  const row: Record<string, any> = {
    user_id: user.id,
    account_id: account_id || null,
    txn_date,
    merchant,
    description: description ?? null,
    category,
    sub_category: sub_category || null,
    amount: Math.abs(Number(amount)),
    currency,
    country,
    txn_type: txn_type ?? 'expense',
    source: 'manual',
    is_verified: true,
    counter_account_id: counter_account_id || null,
    counter_amount: Number(counter_amount) > 0 ? Number(counter_amount) : null,   // the rupees that landed (migration 043)
    counter_estimated: Number(counter_amount) > 0 ? !!counter_estimated : null,   // the app's estimate, not what you told it
    payment_mode: payment_mode || null,
    holder_name: holder_name || null,
    tax_tag: tax_tag || null,
    event_id: event_id || null,              // the trip or event it belongs to (migration 034)
    paid_by_friend_id: paid_by_friend_id || null,   // a friend paid for you (migration 036)
  }
  // "Always do this" rules fill a vague category or a missing account (migration 027)
  applyRules(await loadRules(supabase, user.id), row)
  // A friend paid: nothing left any of your accounts, whatever a rule says
  if (row.paid_by_friend_id) row.account_id = null
  const insert = () => supabase.from('transactions').insert(row).select().single()
  let { data, error } = await insert()
  // (an estimate with no way to mark it as one would read as what you entered)
  for (let c; error && (c = missingCol(error, row)); ) { if (c === 'counter_estimated' && row[c]) delete row.counter_amount; delete row[c]; ({ data, error } = await insert()) }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: data })
}

// PATCH /api/transactions — update a transaction by id
export async function PATCH(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  // Only the transaction's own fields can change (never user_id, source…)
  const EDITABLE = ['txn_date', 'merchant', 'description', 'category', 'sub_category', 'amount', 'currency', 'account_id', 'txn_type', 'counter_account_id', 'counter_amount', 'counter_estimated', 'payment_mode', 'holder_name', 'tax_tag', 'receipt_path', 'event_id', 'paid_by_friend_id']
  const updates: Record<string, any> = Object.fromEntries(EDITABLE.filter(k => k in body).map(k => [k, body[k]]))
  if ('amount' in updates) updates.amount = Math.abs(Number(updates.amount))
  if ('account_id' in updates) updates.account_id = updates.account_id || null
  if ('sub_category' in updates) updates.sub_category = updates.sub_category || null
  if ('counter_account_id' in updates) updates.counter_account_id = updates.counter_account_id || null
  if ('counter_amount' in updates) updates.counter_amount = Number(updates.counter_amount) > 0 ? Number(updates.counter_amount) : null
  if ('payment_mode' in updates) updates.payment_mode = updates.payment_mode || null
  for (const k of ['holder_name', 'tax_tag', 'receipt_path', 'event_id', 'paid_by_friend_id']) if (k in updates) updates[k] = updates[k] || null
  if (updates.paid_by_friend_id) updates.account_id = null
  if (updates.currency) updates.country = updates.currency === 'AED' ? 'UAE' : 'India'

  const run = () => supabase.from('transactions').update(updates).eq('id', id).eq('user_id', user.id).select().single()
  let { data, error } = await run()
  for (let c; error && (c = missingCol(error, updates)); ) { if (c === 'counter_estimated' && updates[c]) delete updates.counter_amount; delete updates[c]; ({ data, error } = await run()) }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: data })
}

// DELETE /api/transactions?id=xxx
export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // An entry the app made (SIP, EMI…): the units or loan payment go with it
  const { data: row } = await supabase.from('transactions').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (row?.auto_ref) {
    const err = await rejectAuto(supabase, row)
    if (err) return NextResponse.json({ error: err }, { status: 500 })
    return NextResponse.json({ success: true })
  }
  // Linked to a fund, share, RD or loan: what linking recorded there goes with it
  if (row?.link_ref) await undoLinked(supabase, row.link_ref, Number(row.amount) || 0)
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
