// Migration 032 data every net-worth screen adds to its holdings: property,
// vehicles, jewellery and other investments, and the investor profile (UAE
// gratuity, questionnaire answers, target mix). Empty before 032 is run.
import { isMissingTable } from './supabase/missingTable'

export async function loadWealthExtras(supabase: any, uid: string) {
  const [oa, prof] = await Promise.all([
    supabase.from('other_assets').select('*').eq('user_id', uid).eq('is_active', true).order('created_at'),
    supabase.from('investor_profile').select('*').eq('user_id', uid).maybeSingle(),
  ])
  return {
    otherAssets: (oa.data ?? []) as any[],
    profile: (prof.data ?? null) as { answers: Record<string, any>; targets: any; gratuity: any } | null,
    gratuity: prof.data?.gratuity ?? null,
    ready: !isMissingTable(oa.error) && !oa.error,
  }
}
