import { NextResponse } from 'next/server'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadTodo } from '@/lib/todoData'

// The To do list (lib/todo) for the bell, Home's bar and the overviews
export async function GET() {
  const sb = createClient()
  const user = await getSessionUser(sb)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { items, today } = await loadTodo(sb, user.id)
  return NextResponse.json({ items, today }, { headers: { 'Cache-Control': 'no-store' } })
}
