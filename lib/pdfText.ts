// PDF → text with one line per visual row (items sorted top-to-bottom, then
// left-to-right), so "Label  Value" pairs stay on the same line. Local only:
// the file never leaves the server. Throws pdf.js's PasswordException for
// protected files — callers turn that into a password prompt.
export async function extractStructuredText(bytes: Uint8Array, password?: string): Promise<string> {
  const { getDocumentProxy } = await import('unpdf')
  const pdfDoc = await getDocumentProxy(bytes, password ? { password } : {}) as any

  let fullText = ''
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page        = await pdfDoc.getPage(p)
    const textContent = await page.getTextContent()

    const rawItems: Array<{ x: number; y: number; str: string }> = []
    for (const item of textContent.items) {
      const i = item as any
      if (!i.str?.trim() || !i.transform) continue
      rawItems.push({ x: i.transform[4], y: i.transform[5], str: i.str })
    }
    rawItems.sort((a, b) => b.y - a.y || a.x - b.x)

    const rowMap = new Map<number, Array<{ x: number; str: string }>>()
    let rowKey = -1, lastY = NaN
    for (const item of rawItems) {
      if (isNaN(lastY) || Math.abs(item.y - lastY) > 3) {
        rowKey = Math.round(item.y); lastY = item.y
      }
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, [])
      rowMap.get(rowKey)!.push({ x: item.x, str: item.str })
    }

    const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const cells = rowMap.get(y)!.sort((a, b) => a.x - b.x)
      const line  = cells.map(c => c.str).join(' ').trim()
      if (line) fullText += line + '\n'
    }
    fullText += '\n'
  }
  return fullText
}

// pdf.js password errors: code 1 = password needed, 2 = wrong password
export function pdfPasswordError(err: any, triedPassword: boolean): 'needs' | 'wrong' | null {
  const name = err?.name ?? '', code = err?.code
  const msg = String(err?.message ?? '').toLowerCase()
  if (name !== 'PasswordException' && !msg.includes('password') && !msg.includes('encrypt')) return null
  return code === 2 || (triedPassword && (msg.includes('incorrect') || msg.includes('wrong'))) ? 'wrong' : 'needs'
}
