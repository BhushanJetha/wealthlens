// "Always do this" rules (migration 027, txn_rules): when a merchant name
// contains a rule's text, set the category and/or the account it was paid
// from. Made in one tap from Money › Review; applied when a transaction is
// added and when a statement is imported.
import { normMerchant } from './categoryMemory'
import { isMissingTable } from './supabase/missingTable'

export interface TxnRule {
  id: string; match_text: string; label: string | null
  set_category: string | null; set_account_id: string | null
}

// Words that say how a payment was made, not who was paid
const NOISE = new Set(['pos', 'upi', 'purchase', 'payment', 'paid', 'to', 'from', 'by', 'at', 'the', 'www', 'com', 'ach', 'nach',
  'neft', 'imps', 'rtgs', 'ecom', 'online', 'debit', 'credit', 'card', 'txn', 'ref', 'mr', 'mrs', 'ms', 'dr', 'cr', 'bil', 'billpay'])
// Place names: on their own they'd match half the statement
const PLACES = new Set(['dubai', 'abu', 'dhabi', 'sharjah', 'ajman', 'uae', 'india', 'mumbai', 'delhi', 'bangalore', 'bengaluru',
  'chennai', 'hyderabad', 'pune', 'kolkata', 'kochi', 'calicut', 'kozhikode'])

// The text a rule looks for: the merchant's first real word, or its first
// two when the first is short or a place ("Dubai Restaurants").
export function ruleTextFor(merchant: string): string {
  const words = String(merchant ?? '').toLowerCase().split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !NOISE.has(w))
  if (!words.length) return normMerchant(merchant)
  const one = words[0]
  return one.length >= 5 && !PLACES.has(one) ? one : words.slice(0, 2).join('')
}

export async function loadRules(supabase: any, userId: string): Promise<TxnRule[]> {
  const { data, error } = await supabase.from('txn_rules').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  if (error && !isMissingTable(error)) console.warn('txn_rules:', error.message)
  return data ?? []
}

export const ruleMatches = (r: TxnRule, merchant: string) => !!r.match_text && normMerchant(merchant).includes(r.match_text)

// Fill what's missing (a vague category, no account) from the newest
// matching rule. `force` lets a rule override any category — used on import,
// where the category is only a guess.
export function applyRules<T extends { merchant?: string; category?: string; account_id?: string | null }>(rules: TxnRule[], t: T, force = false): T {
  if (!rules.length || !t.merchant) return t
  const vague = !t.category || /^(other|uncategori[sz]ed)$/i.test(String(t.category).trim())
  for (const r of rules) {
    if (!ruleMatches(r, t.merchant)) continue
    if (r.set_category && (vague || force)) t.category = r.set_category
    if (r.set_account_id && !t.account_id) t.account_id = r.set_account_id
    break
  }
  return t
}
