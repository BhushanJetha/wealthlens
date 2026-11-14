// The "?" next to a page title: what the page shows, where its numbers come
// from, and the guide to read. Longest matching path wins.
export interface Help { what: string; from: string; guide?: { label: string; href: string } }
const LEARN = (label: string, href = '/dashboard/learn') => ({ label, href })

export const HELP: Record<string, Help> = {
  '/dashboard': { what: 'Everything at a glance for the period picked: what came in, was spent, saved and invested, loans and net worth, and what needs you.', from: 'Your transactions, holdings, loans and the net worth saved each day you open the app.', guide: LEARN('Start here') },
  '/dashboard/money': { what: 'Your money in more depth: income and where it came from, spending by category and shop, card bills, money sent home, accounts and friends.', from: 'Your transactions, counted the same way as Home and Reports.', guide: LEARN('Why categories beat totals', '/dashboard/expenses/learn') },
  '/dashboard/expenses': { what: 'Every entry for the months picked, with filters. Swipe a row on a phone to delete or edit it; press and hold to pick several.', from: 'Statements you import, bank messages, and entries you add.', guide: LEARN('Why categories beat totals', '/dashboard/expenses/learn') },
  '/dashboard/income': { what: 'What came in, by source, and what’s expected next.', from: 'Income entries; money landing from the UAE counts in the India view.' },
  '/dashboard/transfers': { what: 'Money moving between your accounts and from the UAE to India, with the rate each transfer got.', from: 'Transfers in your statements, paired across both sides.' },
  '/dashboard/reports': { what: 'A statement for each month: income, spending, saving, and each account’s money in and out.', from: 'Your transactions, with the same rules as every other page.' },
  '/dashboard/net-worth': { what: 'What you own and owe, how it has moved and why, your mix against its target, and safety checks.', from: 'Holdings at today’s prices, bank balances from your records, property at the value you set, and loans.', guide: LEARN('What net worth really tells you') },
  '/dashboard/investments': { what: 'Every investment, what you put in and what it’s worth now.', from: 'Holdings you add or import, and prices from AMFI and the markets.' },
  '/dashboard/loans': { what: 'What’s left on each loan, when it ends, interest paid, and how a prepayment would help.', from: 'Loan details and the EMIs recorded against each loan.' },
  '/dashboard/assets': { what: 'Homes, land, gold and other things you own, with what each is worth and how it was paid for.', from: 'Values you set, the property’s payment steps, and the loan’s records.' },
  '/dashboard/plan': { what: 'Where your money is going next: this month’s plan, budgets running fast, what’s due, goals, the year ahead and tax room.', from: 'Your income, bills, budgets, goals and loans — the same numbers as each Plan tab.' },
  '/dashboard/budgets': { what: 'This month’s budgets and how fast each is being used. The black mark is where an even pace would be.', from: 'Your budgets and this month’s spending.', guide: LEARN('Budgets that bend, not break', '/dashboard/budgets/learn') },
  '/dashboard/bills': { what: 'Everything that repeats or comes due: rent, EMIs, card bills, premiums, big yearly bills and builder payments.', from: 'Your repeating entries, loans, cards, policies, property payment steps and bills found in your history.' },
  '/dashboard/goals': { what: 'Each goal, what it needs each month, and whether it’s on track.', from: 'Goals you set and what’s saved or linked to each.', guide: LEARN('The three-line goal plan', '/dashboard/goals/learn') },
  '/dashboard/plan/year': { what: 'Each month of the next twelve: income expected, less what’s planned to leave. A tight month shows up early.', from: 'Bills, EMIs, big bills and builder payments on their dates, trips, goals and everyday spending.' },
  '/dashboard/cashflow': { what: 'Your bank balance day by day, with salary, bills and EMIs placed on their dates.', from: 'Regular income and spending found in your last four months, and your loans.' },
  '/dashboard/tax': { what: 'This financial year’s deductions and how much room is left in each.', from: 'PPF, ELSS, NPS, LIC, insurance premiums, home loan EMIs and expenses you tagged.' },
  '/dashboard/todo': { what: 'Everything that needs you, sorted by how soon it matters. “Later” hides an item to a day; “Not for me” for good.', from: 'Bills and EMIs due, accounts running short, entries to review, budgets, goals and your portfolio checks.' },
}
export function helpFor(path: string): Help | null {
  let best: string | null = null
  for (const k of Object.keys(HELP)) if ((path === k || (k !== '/dashboard' && path.startsWith(k + '/'))) && (!best || k.length > best.length)) best = k
  return best ? HELP[best] : null
}
