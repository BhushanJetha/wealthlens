// What the user said they're working towards during onboarding. Stored on the
// auth user (user_metadata.goal_interests) — no amounts yet, so Home offers
// each one as a one-click "set up this goal" instead of inventing targets.
export const GOAL_INTERESTS = [
  'Emergency fund', 'Buy a home', 'Retirement', 'Kids’ education',
  'Travel', 'Clear loans', 'Start investing', 'Save tax',
] as const

// AddGoalModal category to pre-select (drives which investments auto-link)
export const GOAL_INTEREST_CATEGORY: Record<string, string> = {
  'Emergency fund': 'emergency',
  'Buy a home': 'real_estate',
  'Retirement': 'retirement',
  'Start investing': 'mutual_fund',
}

export function goalInterestsOf(meta: any): string[] {
  const v = meta?.goal_interests
  return Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string').slice(0, 8) : []
}

export const newGoalHref = (name: string) => `/dashboard/goals?new=${encodeURIComponent(name)}`
