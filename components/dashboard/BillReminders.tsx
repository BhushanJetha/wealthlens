'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/format'
import { spendCategories } from '@/lib/recurringGoals'
import { toast } from '@/components/ui/toaster'
import { billReminders, payBill, setAsideBill, skipBill, type Bill, type BillReminder } from '@/lib/bigBills'
import { PaySheet } from './BillSheets'

export const billReminderCount = (bills: Bill[], txns: any[], today: string, skips: string[]) => billReminders(bills, txns, today, skips).length

const DOT: Record<BillReminder['kind'], string> = { paid: '#2FB67C', due: '#DC2626', soon: '#D97706', month: '#6A55E8', group: '#6A55E8' }

// Rows for Needs you: set aside this month, 30 days out, 7 days out and on the day
export default function BillReminders({ bills, skips, txns, today, accounts }: { bills: Bill[]; skips: string[]; txns: any[]; today: string; accounts: any[] }) {
  const router = useRouter()
  const [done, setDone] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [paying, setPaying] = useState<Bill | null>(null)
  const rows = billReminders(bills, txns, today, skips).filter(r => !done.has(r.id))

  async function run(r: BillReminder, fn: (sb: any, uid: string) => Promise<string | null>, note?: string) {
    setBusy(r.id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const err = user ? await fn(supabase, user.id) : 'Please sign in again.'
    setBusy(null)
    if (err) { toast(err, 'error'); return }
    setDone(s => new Set(s).add(r.id))
    if (note) toast(note)
    router.refresh()
  }
  const aside = (r: BillReminder) => run(r, async (sb, uid) => {
    for (const b of r.bills) {
      const err = await setAsideBill(sb, uid, b, r.kind === 'group' ? b.monthly : r.amount, today)
      if (err) return err
    }
    return null
  }, `${fmtMoney(r.amount, r.currency)} set aside. It’s no longer in Free to spend.`)
  const later = (r: BillReminder) => run(r, (sb, uid) => skipBill(sb, uid, r.skip!))
  const btn = 'wl-btn disabled:opacity-60', st = { height: 30, fontSize: 12 }

  return (<>
    {rows.map(r => {
      const b = busy === r.id, money = (n: number) => fmtMoney(n, r.currency)
      return (
        <li key={r.id} className="flex gap-2.5 items-center py-[9px] flex-wrap md:flex-nowrap wl-hide-viewing" style={{ borderTop: '1px solid #F1F5F9' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT[r.kind] }} />
          <span className="flex-1 min-w-0 max-md:basis-[calc(100%-18px)]">
            <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{r.title}</span>
            <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{r.sub}</span>
          </span>
          <span className="flex gap-1.5 flex-wrap max-md:w-full max-md:pl-[18px] md:flex-shrink-0 md:justify-end">
            {r.kind === 'paid' && (<>
              <button onClick={() => run(r, (sb, uid) => payBill(sb, uid, r.bill!, { amount: r.amount, date: String(r.txn.txn_date).slice(0, 10), accountId: r.txn.account_id, existing: true }), `${r.bill!.name} marked as paid`)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Yes, it’s paid</button>
              <button onClick={() => later(r)} disabled={b} className={btn} style={st}>No</button>
            </>)}
            {r.kind === 'due' && (<>
              <button onClick={() => setPaying(r.bill)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Paid</button>
              {r.amount > 0 && <button onClick={() => aside(r)} disabled={b} className={btn} style={st}>Set aside {money(r.amount)}</button>}
            </>)}
            {r.kind === 'soon' && (<>
              <button onClick={() => aside(r)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Set aside {money(r.amount)}</button>
              <button onClick={() => setPaying(r.bill)} disabled={b} className={btn} style={st}>Paid</button>
              <button onClick={() => later(r)} disabled={b} className={btn} style={st}>Later</button>
            </>)}
            {r.kind === 'month' && (<>
              <button onClick={() => aside(r)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Set aside</button>
              <button onClick={() => later(r)} disabled={b} className={btn} style={st}>Not this month</button>
            </>)}
            {r.kind === 'group' && (<>
              <button onClick={() => aside(r)} disabled={b} className={`${btn} wl-btn-primary`} style={st}>Set aside all</button>
              <a href="/dashboard/big-bills" className={btn} style={st}>See them</a>
            </>)}
          </span>
        </li>
      )
    })}
    {paying && <PaySheet bill={paying} accounts={accounts} categories={spendCategories(txns)} txns={txns} today={today} onClose={() => setPaying(null)} />}
  </>)
}
