// True when a Supabase error means the table doesn't exist yet (its migration
// hasn't been run), so features can fall back instead of failing.
export const isMissingTable = (e: any) =>
  !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find the table/i.test(e.message || ''))
