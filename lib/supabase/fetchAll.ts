// PostgREST returns at most 1000 rows per request (this project's max-rows),
// and .limit(5000) silently stops at 1000 — so page through with .range().
// `page(from, to)` must return the query with .range(from, to) applied.
type Page = (from: number, to: number) => any

// Same { data, error } shape as a plain query, so it drops into Promise.all
// lists. A failed page returns what was read so far plus the error.
export async function fetchAll(page: Page, maxPages = 25): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999)
    if (error) return { data: out, error }
    if (!data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return { data: out, error: null }
}

export async function fetchAllRows(page: Page, maxPages = 25): Promise<any[]> {
  return (await fetchAll(page, maxPages)).data
}
