import Anthropic from '@anthropic-ai/sdk'

// One place for WealthLens' Claude calls (advisor, voice entry, bill photos).
// The key comes from ANTHROPIC_API_KEY in .env.local — never commit it.
// PDF statements are NOT sent here: the app parses PDFs locally.

export const MODEL = 'claude-opus-5-5'

export class AiNotConfigured extends Error {
  constructor() { super('ANTHROPIC_API_KEY is missing from .env.local. Add it and restart the dev server.') }
}
export class AiRefused extends Error {
  constructor() { super('The request was declined. Try rephrasing it.') }
}

// True when a real-looking key is set (a placeholder doesn't count) — features
// that only work with AI show themselves only then
export const aiConfigured = () => /^sk-ant-[A-Za-z0-9_-]{40,}$/.test((process.env.ANTHROPIC_API_KEY ?? '').trim())

let client: Anthropic | null = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfigured()
  return (client ??= new Anthropic())
}

export async function askClaude(opts: {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  effort?: 'low' | 'medium' | 'high'
  maxTokens?: number
  // JSON schema for structured output (the reply text is then valid JSON)
  schema?: Record<string, unknown>
}): Promise<string> {
  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    // A declined request is re-run on Anthropic's recommended fallback model
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: opts.effort ?? 'medium',
      ...(opts.schema ? { format: { type: 'json_schema' as const, schema: opts.schema } } : {}),
    },
    system: opts.system,
    messages: opts.messages,
  })
  if (res.stop_reason === 'refusal') throw new AiRefused()
  return res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim()
}

// Maps helper errors to the JSON shape the UI already expects
export function aiErrorResponse(err: unknown): { body: { error: string; details: string }; status: number } {
  if (err instanceof AiNotConfigured) return { body: { error: 'AI service not configured', details: err.message }, status: 503 }
  if (err instanceof AiRefused) return { body: { error: 'Request declined', details: err.message }, status: 422 }
  if (err instanceof Anthropic.AuthenticationError) return { body: { error: 'AI key rejected', details: 'ANTHROPIC_API_KEY was not accepted. Check the key in .env.local.' }, status: 503 }
  if (err instanceof Anthropic.RateLimitError) return { body: { error: 'AI is busy', details: 'Too many requests right now. Try again in a minute.' }, status: 429 }
  if (err instanceof Anthropic.APIError) return { body: { error: 'AI service error', details: err.message }, status: 502 }
  return { body: { error: 'AI service error', details: err instanceof Error ? err.message : 'Unknown error' }, status: 500 }
}
