// The UAE / India / All choice applied to any list: the UAE view keeps
// dirham rows, India keeps rupee rows, All keeps both. A row with no currency
// belongs to neither country, so it stays.
export type View = 'uae' | 'india' | 'consolidated'
export const curInView = (cur: string | null | undefined, view: View) =>
  view === 'consolidated' || !cur || (view === 'uae') === (cur === 'AED')
export const rowsInView = <T>(rows: T[] | null | undefined, view: View): T[] =>
  (rows ?? []).filter((r: any) => curInView(r?.currency, view))
// Every list in an object of props, filtered the same way
export const propsInView = <T extends Record<string, any>>(props: T, view: View): T =>
  view === 'consolidated' ? props : Object.fromEntries(Object.entries(props).map(([k, v]) => [k, Array.isArray(v) ? rowsInView(v, view) : v])) as T
