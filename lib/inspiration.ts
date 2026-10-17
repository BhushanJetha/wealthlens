// Content for the Money Mindset board (and the quote on the Freedom Check).
// Quotes carry their commonly cited author; unattributed lines are our own.

export type Topic = 'freedom' | 'saving' | 'goals' | 'loans' | 'investing' | 'mindset' | 'protection'

export const TOPICS: { key: Topic; label: string; emoji: string }[] = [
  { key: 'freedom',    label: 'Financial Freedom', emoji: '🕊️' },
  { key: 'saving',     label: 'Saving',            emoji: '🐷' },
  { key: 'goals',      label: 'Goal Setting',      emoji: '🎯' },
  { key: 'loans',      label: 'Loans & Debt',      emoji: '⛓️' },
  { key: 'investing',  label: 'Investing',         emoji: '📈' },
  { key: 'mindset',    label: 'Money Mindset',     emoji: '🧠' },
  { key: 'protection', label: 'Protection',        emoji: '🛡️' },
]

export interface Quote { text: string; author?: string; topic: Topic }

export const QUOTES: Quote[] = [
  // Financial freedom
  { topic: 'freedom', text: 'Financial freedom is a process, not a destination.' },
  { topic: 'freedom', text: 'The goal isn’t more money. The goal is living life on your terms.', author: 'Chris Brogan' },
  { topic: 'freedom', text: 'Wealth consists not in having great possessions, but in having few wants.', author: 'Epictetus' },
  { topic: 'freedom', text: 'Financial freedom is available to those who learn about it and work for it.', author: 'Robert Kiyosaki' },
  { topic: 'freedom', text: 'Money is a terrible master but an excellent servant.', author: 'P.T. Barnum' },
  { topic: 'freedom', text: 'Wealth is the ability to fully experience life.', author: 'Henry David Thoreau' },
  { topic: 'freedom', text: 'Same salary. Bigger plans. Bigger freedom.' },
  // Saving
  { topic: 'saving', text: 'Do not save what is left after spending, but spend what is left after saving.', author: 'Warren Buffett' },
  { topic: 'saving', text: 'Beware of little expenses. A small leak will sink a great ship.', author: 'Benjamin Franklin' },
  { topic: 'saving', text: 'The habit of saving is itself an education.', author: 'T.T. Munger' },
  { topic: 'saving', text: 'You must gain control over your money or the lack of it will forever control you.', author: 'Dave Ramsey' },
  { topic: 'saving', text: 'Small daily savings quietly build big futures.' },
  { topic: 'saving', text: 'Pay yourself first — then pay the bills.' },
  // Goal setting
  { topic: 'goals', text: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
  { topic: 'goals', text: 'Setting goals is the first step in turning the invisible into the visible.', author: 'Tony Robbins' },
  { topic: 'goals', text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese proverb' },
  { topic: 'goals', text: 'Someone’s sitting in the shade today because someone planted a tree a long time ago.', author: 'Warren Buffett' },
  { topic: 'goals', text: 'Dream. Plan. Do. Repeat.' },
  // Loans & debt
  { topic: 'loans', text: 'Debt is the slavery of the free.', author: 'Publilius Syrus' },
  { topic: 'loans', text: 'The borrower is slave to the lender.', author: 'Proverbs 22:7' },
  { topic: 'loans', text: 'Rather go to bed without dinner than to rise in debt.', author: 'Benjamin Franklin' },
  { topic: 'loans', text: 'Never spend your money before you have it.', author: 'Thomas Jefferson' },
  { topic: 'loans', text: 'Every EMI you prepay is a guaranteed return at your loan’s interest rate.' },
  // Investing
  { topic: 'investing', text: 'The stock market is a device for transferring money from the impatient to the patient.', author: 'Warren Buffett' },
  { topic: 'investing', text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { topic: 'investing', text: 'Don’t look for the needle in the haystack. Just buy the haystack!', author: 'John C. Bogle' },
  { topic: 'investing', text: 'Risk comes from not knowing what you’re doing.', author: 'Warren Buffett' },
  { topic: 'investing', text: 'The four most dangerous words in investing are: “this time it’s different.”', author: 'Sir John Templeton' },
  { topic: 'investing', text: 'Know what you own, and know why you own it.', author: 'Peter Lynch' },
  { topic: 'investing', text: 'Time in the market beats timing the market.' },
  // Mindset
  { topic: 'mindset', text: 'It’s not how much money you make, but how much money you keep.', author: 'Robert Kiyosaki' },
  { topic: 'mindset', text: 'Your future is created by what you do today, not tomorrow.', author: 'Robert Kiyosaki' },
  { topic: 'mindset', text: 'Same habits, same results. New habits, new life.' },
  { topic: 'mindset', text: 'Rich is what you earn. Wealthy is what you keep and grow.' },
  // Protection
  { topic: 'protection', text: 'Insurance isn’t for you — it’s for the people who depend on you.' },
  { topic: 'protection', text: 'Hope for the best, prepare for the worst.', author: 'Proverb' },
  { topic: 'protection', text: 'An emergency fund turns a crisis into an inconvenience.' },
]

// Numbered "infographic" cards
export interface TipList {
  id: string; topic: Topic; title: string; accent: string; subtitle?: string
  items: { emoji: string; title: string; desc: string }[]
  footer?: string; check?: boolean
}

export const TIP_LISTS: TipList[] = [
  { id: 'broke', topic: 'mindset', accent: '#DC2626', title: '7 Habits That Keep People Broke',
    items: [
      { emoji: '🛒', title: 'Spend more than they earn', desc: 'Living beyond means is the #1 trap' },
      { emoji: '📋', title: 'No plan, no budget', desc: 'Hope is not a strategy' },
      { emoji: '🐷', title: 'Don’t save', desc: 'No savings = no options' },
      { emoji: '💳', title: 'Live on credit cards', desc: 'Borrow today, pay forever' },
      { emoji: '🌱', title: 'Don’t invest', desc: 'Inflation quietly eats idle cash' },
      { emoji: '🫙', title: 'No emergency fund', desc: 'One surprise bill becomes debt' },
      { emoji: '🏎️', title: 'Buy to impress', desc: 'New car, new phone, same bank balance' },
    ],
    footer: 'The good news? Habits can change. Start with one today.' },
  { id: 'loans', topic: 'loans', accent: '#EA580C', title: '7 Ways to Save on Loans',
    items: [
      { emoji: '⏩', title: 'Prepay early', desc: 'Interest is front-loaded — early prepayments save the most' },
      { emoji: '➕', title: 'One extra EMI a year', desc: 'Can cut years off a home loan' },
      { emoji: '📈', title: 'Step up EMI with raises', desc: '+5% EMI each year shortens the tenure sharply' },
      { emoji: '🔁', title: 'Refinance when cheaper', desc: 'Switch if another bank is 0.5%+ lower' },
      { emoji: '🔥', title: 'Kill costly debt first', desc: 'Cards & personal loans before the home loan' },
      { emoji: '⏳', title: 'Shorter tenure', desc: 'Higher EMI, far less total interest' },
      { emoji: '🚫', title: 'No loans for wants', desc: 'Borrow for assets, never for holidays' },
    ] },
  { id: 'smart', topic: 'goals', accent: '#2563EB', title: 'Set SMART Money Goals',
    items: [
      { emoji: '🎯', title: 'Specific', desc: '“Car down-payment”, not “save more”' },
      { emoji: '📏', title: 'Measurable', desc: 'Put a number on it — ₹6 lakh' },
      { emoji: '🧗', title: 'Achievable', desc: 'Fits your monthly surplus' },
      { emoji: '❤️', title: 'Relevant', desc: 'Matters to you and your family' },
      { emoji: '📅', title: 'Time-bound', desc: 'By Dec 2027 → ₹22K a month' },
    ],
    footer: 'Write it down, automate it, review it monthly.' },
  { id: 'before', topic: 'protection', accent: '#16A34A', title: 'Before You Invest, Check:', check: true,
    items: [
      { emoji: '🛡️', title: 'Term life insurance', desc: '10–15× yearly income if anyone depends on you' },
      { emoji: '🏥', title: 'Health insurance', desc: 'One hospital stay can wipe out years of savings' },
      { emoji: '🫙', title: 'Emergency fund', desc: '3–6 months of expenses, easy to access' },
      { emoji: '💳', title: 'No credit-card debt', desc: 'Nothing beats a guaranteed 36% “return”' },
    ],
    footer: 'Protection first, growth second.' },
  { id: 'wealthy', topic: 'mindset', accent: '#7C3AED', title: 'What Wealthy People Do Differently',
    items: [
      { emoji: '📊', title: 'Track every rupee', desc: 'You can’t improve what you don’t measure' },
      { emoji: '🤖', title: 'Automate saving', desc: 'SIP on salary day, before spending' },
      { emoji: '📚', title: 'Keep learning', desc: 'One money book or podcast a month' },
      { emoji: '🧘', title: 'Stay patient', desc: 'Wealth is built over decades, not days' },
      { emoji: '🎁', title: 'Give generously', desc: 'Abundance follows gratitude' },
    ] },
]
