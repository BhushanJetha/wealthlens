// A CAS statement lists every payment into a fund, including ones WealthLens
// already recorded (a SIP entered by itself, a buy you added, a payment linked
// from your bank). Those are the same money: a statement row is skipped when a
// recorded payment on the same fund has the same amount (within 1%) and a date
// within 3 days. Each recorded payment matches one statement row at most.
const dayNum = (d: string) => Math.floor(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) / 864e5)
const BUYS = new Set(['sip', 'purchase', 'switch_in'])

export interface CasRow { date: string; type?: string; amount?: number }
export function casNew<T extends CasRow>(cas: T[], recorded: { txn_date: string; txn_type: string; amount: number }[]): { add: T[]; already: T[] } {
  const pool = recorded.filter(r => BUYS.has(r.txn_type))
  const used = new Set<number>()
  const add: T[] = [], already: T[] = []
  for (const c of cas) {
    const amt = Number(c.amount) || 0
    const isBuy = BUYS.has(c.type ?? 'purchase')
    let hit = -1, gap = Infinity
    if (isBuy && amt > 0) pool.forEach((r, i) => {
      if (used.has(i)) return
      const g = Math.abs(dayNum(r.txn_date) - dayNum(c.date))
      if (g <= 3 && Math.abs((Number(r.amount) || 0) - amt) <= Math.max(1, amt * 0.01) && g < gap) { hit = i; gap = g }
    })
    if (hit >= 0) { used.add(hit); already.push(c) } else add.push(c)
  }
  return { add, already }
}
