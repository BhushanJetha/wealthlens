import { createClient, getSessionUser } from '@/lib/supabase/server'
import { loadTodo } from '@/lib/todoData'
import TodoClient from '@/components/dashboard/todo/TodoClient'

// To do: everything that needs you, in one list (lib/todo), with the entries
// waiting for a yes or no answered right here
export default async function TodoPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const t = await loadTodo(supabase, user!.id)
  return <TodoClient items={t.items} today={t.today} fx={t.fx} pending={t.auto.pending} recurring={t.auto.recurring} txns={t.txns} accounts={t.accounts} plans={t.plans} bills={t.bills} billSkips={t.answers} />
}
