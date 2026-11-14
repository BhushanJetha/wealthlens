'use client'
// The To do list (/api/todo), read once for every place on the page that shows
// it (bell, Home, an overview) and kept for two minutes. Snoozed and
// "not for me" items are kept on this device and left out everywhere.
import { useEffect, useState } from 'react'
import { visibleTodo, TODO_HIDE_KEY, type TodoItem } from '@/lib/todo'

let shared: { at: number; p: Promise<{ items: TodoItem[]; today: string }> } | null = null
const EVT = 'wl-todo'
const load = (fresh = false) => {
  if (!fresh && shared && Date.now() - shared.at < 120000) return shared.p
  const p = fetch('/api/todo').then(r => (r.ok ? r.json() : Promise.reject())).catch(() => ({ items: [], today: '' }))
  shared = { at: Date.now(), p }
  return p
}
const readHidden = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(TODO_HIDE_KEY) || '{}') } catch { return {} } }

// `initial`: the list a page already built on the server (the To do page)
export function useTodo(initial?: { items: TodoItem[]; today: string }) {
  const [data, setData] = useState<{ items: TodoItem[]; today: string } | null>(initial ?? null)
  const [hidden, setHidden] = useState<Record<string, string>>({})
  useEffect(() => {
    setHidden(readHidden())
    if (initial) shared = { at: Date.now(), p: Promise.resolve(initial) }
    else load().then(setData)
    const on = () => { setHidden(readHidden()); load().then(setData) }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const today = data?.today || new Date().toISOString().slice(0, 10)
  const items = data ? visibleTodo(data.items, hidden, today) : []
  // Hide until a day ('9999-12-31' = not for me), or bring everything back
  const hide = (id: string, until: string) => {
    const h = { ...readHidden(), [id]: until }
    try { localStorage.setItem(TODO_HIDE_KEY, JSON.stringify(h)) } catch {}
    setHidden(h); window.dispatchEvent(new Event(EVT))
  }
  const refresh = () => load(true).then(d => { setData(d); window.dispatchEvent(new Event(EVT)) })
  return { loaded: !!data, items, all: data?.items ?? [], today, hide, refresh, hiddenCount: data ? data.items.length - items.length : 0,
    unhideAll: () => { try { localStorage.removeItem(TODO_HIDE_KEY) } catch {}; setHidden({}); window.dispatchEvent(new Event(EVT)) } }
}
