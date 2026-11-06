import { createClient } from '@/lib/supabase/server'
import { aiConfigured } from '@/lib/ai/claude'
import { aiSettingsOf } from '@/lib/ai/privacy'
import AiPrivacyClient from '@/components/dashboard/AiPrivacyClient'

// Settings › AI & privacy: the AI switch, the photo switch, what's sent and how to add the key
export default async function AiPrivacyPage() {
  const supabase = createClient()
  // Fresh from the server, so a switch just flipped shows as it is
  const { data } = await supabase.auth.getUser()
  const s = aiSettingsOf(data.user?.user_metadata)
  return <AiPrivacyClient on={s.on} photos={s.photos} keySet={aiConfigured()} />
}
