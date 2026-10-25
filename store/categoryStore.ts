import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { DEFAULT_CATEGORIES, CATEGORY_COLORS, isSystemCategory, type Category, type CatKind } from '@/lib/categories'
import { MOVEMENT_CATS } from '@/lib/money'

// The signed-in user's expense / income categories, shared by every picker.
// First load seeds the built-in list into the `categories` table; until
// migration 024 is run the built-in list is used read-only (`persisted` false).
interface CategoryState {
  rows: Category[]
  status: 'idle' | 'loading' | 'ready'
  persisted: boolean
  load: (force?: boolean) => Promise<void>
  // Each returns an error message, or null when it worked
  add: (c: { kind: CatKind; name: string; color: string; icon: string }) => Promise<string | null>
  update: (id: string, patch: { name?: string; color?: string; icon?: string }) => Promise<string | null>
  remove: (id: string, moveTo: string) => Promise<string | null>
}

const NEEDS_MIGRATION = 'Saving your own categories needs migration 024 (supabase/migrations/024_categories.sql). Run it in Supabase, then try again.'
const byOrder = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
let inflight: Promise<void> | null = null

export const useCategoryStore = create<CategoryState>((set, get) => ({
  rows: DEFAULT_CATEGORIES,
  status: 'idle',
  persisted: false,

  load: async (force = false) => {
    if (inflight) return inflight
    if (get().status === 'ready' && !force) return
    set({ status: 'loading' })
    inflight = (async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { set({ status: 'ready' }); return }
      const [cats, used] = await Promise.all([
        sb.from('categories').select('id,kind,name,color,icon,sort_order').eq('user_id', user.id),
        sb.from('transactions').select('category,txn_type').eq('user_id', user.id).in('txn_type', ['expense', 'income'])
          .order('txn_date', { ascending: false }).limit(5000),
      ])
      let { data, error } = cats
      // Names already on the user's transactions (their own, or from imports)
      // join the list so they can be managed too. Money movements never do.
      const usedDefs: Category[] = []
      for (const u of used.data ?? []) {
        const name = String(u.category ?? '').trim(), kind: CatKind = u.txn_type === 'income' ? 'income' : 'expense'
        if (!name || MOVEMENT_CATS.has(name) || /transfer/i.test(name)) continue
        if (DEFAULT_CATEGORIES.some(d => d.kind === kind && sameName(d.name, name)) || usedDefs.some(d => d.kind === kind && sameName(d.name, name))) continue
        usedDefs.push({ id: `used:${kind}:${name}`, kind, name, color: CATEGORY_COLORS[usedDefs.length % CATEGORY_COLORS.length], icon: 'tag', sort_order: 100 + usedDefs.length })
      }
      if (error) { set({ rows: [...DEFAULT_CATEGORIES, ...usedDefs].sort(byOrder), persisted: false, status: 'ready' }); return }
      // Seed built-ins the first time, add any built-in the app relies on that's
      // missing (e.g. one introduced later), and any name in use not yet listed
      const have = data ?? []
      const listed = (c: Category) => have.some(r => r.kind === c.kind && sameName(r.name, c.name))
      const missing = [
        ...DEFAULT_CATEGORIES.filter(d => have.length === 0 || (isSystemCategory(d.kind, d.name) && !listed(d))),
        ...usedDefs.filter(u => !listed(u)),
      ]
      if (missing.length) {
        await sb.from('categories').insert(missing.map(({ id, ...d }) => ({ ...d, user_id: user.id })))
        ;({ data, error } = await sb.from('categories').select('id,kind,name,color,icon,sort_order').eq('user_id', user.id))
      }
      set({ rows: ((data ?? []) as Category[]).sort(byOrder), persisted: !error, status: 'ready' })
    })().finally(() => { inflight = null })
    return inflight
  },

  add: async ({ kind, name, color, icon }) => {
    const n = name.trim()
    if (!n) return 'Give the category a name.'
    if (n.length > 40) return 'Keep the name under 40 characters.'
    if (!get().persisted) return NEEDS_MIGRATION
    if (get().rows.some(r => r.kind === kind && sameName(r.name, n))) return `You already have a category called ${n}.`
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return 'Please sign in again.'
    const sort_order = Math.max(-1, ...get().rows.filter(r => r.kind === kind).map(r => r.sort_order)) + 1
    const { data, error } = await sb.from('categories').insert({ user_id: user.id, kind, name: n, color, icon, sort_order })
      .select('id,kind,name,color,icon,sort_order').single()
    if (error || !data) return isMissingTable(error) ? NEEDS_MIGRATION : (error?.message ?? 'Could not add the category.')
    set({ rows: [...get().rows, data as Category].sort(byOrder) })
    return null
  },

  // Renaming also renames it on past transactions and budgets, which store the name
  update: async (id, patch) => {
    const row = get().rows.find(r => r.id === id)
    if (!row) return 'That category no longer exists.'
    if (!get().persisted) return NEEDS_MIGRATION
    const name = patch.name?.trim()
    const renaming = !!name && name !== row.name
    if (renaming) {
      if (isSystemCategory(row.kind, row.name)) return `${row.name} is used in the app’s totals, so it can’t be renamed. You can change its colour and icon.`
      if (name!.length > 40) return 'Keep the name under 40 characters.'
      if (get().rows.some(r => r.id !== id && r.kind === row.kind && sameName(r.name, name!))) return `You already have a category called ${name}.`
    }
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return 'Please sign in again.'
    const next = { name: renaming ? name! : row.name, color: patch.color ?? row.color, icon: patch.icon ?? row.icon }
    const { error } = await sb.from('categories').update(next).eq('id', id).eq('user_id', user.id)
    if (error) return error.message
    if (renaming) {
      let q = sb.from('transactions').update({ category: next.name }).eq('user_id', user.id).eq('category', row.name)
      q = row.kind === 'income' ? q.eq('txn_type', 'income') : q.neq('txn_type', 'income')
      const { error: e1 } = await q
      if (row.kind === 'expense') await sb.from('budgets').update({ category: next.name }).eq('user_id', user.id).eq('category', row.name)
      if (e1) return `Renamed, but past transactions couldn’t be updated: ${e1.message}`
    }
    set({ rows: get().rows.map(r => (r.id === id ? { ...r, ...next } : r)) })
    return null
  },

  // Deleting moves its transactions to `moveTo` and removes its budgets
  remove: async (id, moveTo) => {
    const row = get().rows.find(r => r.id === id)
    if (!row) return null
    if (!get().persisted) return NEEDS_MIGRATION
    if (isSystemCategory(row.kind, row.name)) return `${row.name} is used in the app’s totals, so it can’t be deleted.`
    if (!moveTo || moveTo === row.name) return 'Pick another category for its transactions.'
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return 'Please sign in again.'
    let q = sb.from('transactions').update({ category: moveTo }).eq('user_id', user.id).eq('category', row.name)
    q = row.kind === 'income' ? q.eq('txn_type', 'income') : q.neq('txn_type', 'income')
    const { error: e1 } = await q
    if (e1) return `Couldn’t move its transactions: ${e1.message}`
    if (row.kind === 'expense') await sb.from('budgets').delete().eq('user_id', user.id).eq('category', row.name)
    const { error } = await sb.from('categories').delete().eq('id', id).eq('user_id', user.id)
    if (error) return error.message
    set({ rows: get().rows.filter(r => r.id !== id) })
    return null
  },
}))
