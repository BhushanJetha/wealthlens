import { redirect } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  redirect(user ? '/dashboard' : '/auth/login')
}
