import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const { txn_date, merchant, description, category, amount, currency, account_id, txn_type } = body

  if (!txn_date || !merchant || !category || !amount || !currency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const country = currency === 'AED' ? 'UAE' : 'India'

  const { data, error } = await supabase.from('transactions').insert({
    user_id: user.id,
    account_id: account_id || null,
    txn_date,
    merchant,
    description: description ?? null,
    category,
    amount: Math.abs(Number(amount)),
    currency,
    country,
    txn_type: txn_type ?? 'expense',
    source: 'manual',
    is_verified: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: data })
}

// PATCH /api/transactions — update a transaction by id
export async function PATCH(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

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

  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
