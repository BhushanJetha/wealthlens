// PostgREST returns at most 1000 rows per request (this project's max-rows),
// and .limit(5000) silently stops at 1000 — so page through with .range().
// `page(from, to)` must return the query with .range(from, to) applied.
type Page = (from: number, to: number) => any

// Same { data, error } shape as a plain query, so it drops into Promise.all
// lists. A failed page returns what was read so far plus the error.
// Pages are read BATCH at a time in parallel: each read is a round trip
// (~450 ms from UAE/India), so up to 3,000 rows come back in one.
const BATCH = 3
export async function fetchAll(page: Page, maxPages = 25): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let i = 0; i < maxPages; i += BATCH) {
    const reads = Array.from({ length: Math.min(BATCH, maxPages - i) }, (_, k) => page((i + k) * 1000, (i + k) * 1000 + 999))
    for (const { data, error } of await Promise.all(reads)) {
      if (error) return { data: out, error }
      if (!data) return { data: out, error: null }
      out.push(...data)
      if (data.length < 1000) return { data: out, error: null }
    }
  }
  return { data: out, error: null }
}

export async function fetchAllRows(page: Page, maxPages = 25): Promise<any[]> {
  return (await fetchAll(page, maxPages)).data
}
