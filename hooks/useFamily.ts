'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface FamilyMember { id: string; name: string; relationship: string }

// Family members (holders), loaded once per page load and shared by every
// component that asks. `reload()` refreshes after the Manage family modal.
let cache: FamilyMember[] | null = null
let inflight: Promise<FamilyMember[]> | null = null
const listeners = new Set<(m: FamilyMember[]) => void>()

async function fetchMembers(): Promise<FamilyMember[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('family_members')
    .select('id, name, relationship').eq('user_id', user.id).eq('is_active', true).order('created_at')
  return (data ?? []) as FamilyMember[]
}

export function useFamily() {
  const [members, setMembers] = useState<FamilyMember[]>(cache ?? [])

  useEffect(() => {
    listeners.add(setMembers)
    if (!cache) {
      inflight = inflight ?? fetchMembers()
      inflight.then(m => { cache = m; listeners.forEach(l => l(m)) }).catch(() => {})
    }
    return () => { listeners.delete(setMembers) }
  }, [])

  const reload = useCallback(async () => {
    const m = await fetchMembers()
    cache = m
    listeners.forEach(l => l(m))
  }, [])

  return { members, reload }
}

// Holder chips use the same names the data uses: '' = everyone, 'Self' = the
// account owner, otherwise a family member's name (rows' holder_name).
export const holderMatches = (row: any, holder: string) =>
  !holder || (row?.holder_name || 'Self') === holder
