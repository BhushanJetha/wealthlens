import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TABLES: Record<string, string> = {
  stock: 'stocks',
  mutual_fund: 'mutual_funds',
  fixed_deposit: 'fixed_deposits',
  recurring_deposit: 'recurring_deposits',
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [s, m, f, r] = await Promise.all([
    supabase.from('stocks').select('*').eq('user_id', user.id),
    supabase.from('mutual_funds').select('*').eq('user_id', user.id),
    supabase.from('fixed_deposits').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('recurring_deposits').select('*').eq('user_id', user.id).eq('is_active', true),
  ])

  return NextResponse.json({
    stocks: s.data ?? [],
    mutual_funds: m.data ?? [],
    fixed_deposits: f.data ?? [],
    recurring_deposits: r.data ?? [],
  })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, ...payload } = body
  const table = TABLES[type]
  if (!table) return NextResponse.json({ error: 'Invalid investment type' }, { status: 400 })

  const { data, error } = await supabase.from(table).insert({ ...payload, user_id: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ investment: data })
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id   = searchParams.get('id')
  const type = searchParams.get('type')
  if (!id || !type) return NextResponse.json({ error: 'Missing id or type' }, { status: 400 })

  const table = TABLES[type]
  if (!table) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
