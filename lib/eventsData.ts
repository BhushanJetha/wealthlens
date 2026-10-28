// What the Events & trips pages need: every event, every expense tagged to
// one (all years), recent untagged spending (to suggest tags), and goals to
// link. Before migration 034 there are no events — `ready` is false.
import { fetchAllRows } from './supabase/fetchAll'
import { getAedInr } from './fx'
import { isMissingTable } from './supabase/missingTable'

export async function loadEventsData(supabase: any, uid: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)
  const cols = 'id,account_id,txn_date,merchant,description,category,sub_category,amount,currency,txn_type,holder_name,event_id'
  const [{ rate: fx }, evRes, goals] = await Promise.all([
    getAedInr(),
    supabase.from('spend_events').select('*').eq('user_id', uid).order('start_date', { ascending: false }),
    supabase.from('goals').select('id,name,currency,target_amount,target_date,repeat_months,status').eq('user_id', uid).neq('status', 'cancelled'),
  ])
  const ready = !isMissingTable(evRes.error) && !evRes.error
  const [tagged, recent] = ready ? await Promise.all([
    fetchAllRows((a: number, b: number) => supabase.from('transactions').select(cols).eq('user_id', uid).not('event_id', 'is', null).order('txn_date', { ascending: false }).order('id').range(a, b)),
    fetchAllRows((a: number, b: number) => supabase.from('transactions').select(cols).eq('user_id', uid).is('event_id', null).gte('txn_date', since).order('txn_date', { ascending: false }).order('id').range(a, b)),
  ]) : [[], []]
  return { today, fx, ready, events: (evRes.data ?? []) as any[], txns: [...tagged, ...recent] as any[], goals: (goals.data ?? []) as any[] }
}
export type EventsData = Awaited<ReturnType<typeof loadEventsData>>
