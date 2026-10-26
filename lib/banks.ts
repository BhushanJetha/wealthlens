// Bank brands: logo domain and card colours by bank name, so a card or
// account looks like the bank's own. Colours are close to each brand's
// primary colour; logos come from /api/bank-logo (only these domains).

export interface Brand { key: string; label: string; domain: string | null; c1: string; c2: string }

const B = (key: string, label: string, domain: string, c1: string, c2: string, re: RegExp) => ({ key, label, domain, c1, c2, re })
const BRANDS = [
  B('hdfc', 'HDFC Bank', 'hdfcbank.com', '#0B4D93', '#04274B', /hdfc/i),
  B('icici', 'ICICI Bank', 'icicibank.com', '#B4252B', '#EC6B20', /icici/i),
  B('sbi', 'SBI', 'onlinesbi.sbi', '#2A4BA6', '#1890D5', /state bank of india|\bsbi\b/i),
  B('axis', 'Axis Bank', 'axisbank.com', '#97144D', '#45091F', /\baxis\b/i),
  B('kotak', 'Kotak', 'kotak.com', '#003874', '#C4161C', /kotak/i),
  B('idfc', 'IDFC FIRST', 'idfcfirstbank.com', '#9C1D26', '#4E0E13', /idfc/i),
  B('yes', 'YES BANK', 'yesbank.in', '#00518F', '#002A4A', /yes bank/i),
  B('indusind', 'IndusInd', 'indusind.com', '#98272A', '#3D1012', /indusind/i),
  B('bob', 'Bank of Baroda', 'bankofbaroda.in', '#F26522', '#9C3A0D', /baroda|\bbob\b/i),
  B('pnb', 'PNB', 'pnbindia.in', '#A20A3A', '#5A061F', /punjab national|\bpnb\b/i),
  B('canara', 'Canara Bank', 'canarabank.com', '#0091D5', '#005A87', /canara/i),
  B('union', 'Union Bank', 'unionbankofindia.co.in', '#D51F2A', '#1F3F8F', /union bank/i),
  B('federal', 'Federal Bank', 'federalbank.co.in', '#003F87', '#00224A', /federal bank/i),
  B('au', 'AU Bank', 'aubank.in', '#6D2077', '#E8641B', /\bau small|\bau bank/i),
  B('enbd', 'Emirates NBD', 'emiratesnbd.com', '#0A2A5E', '#1D5FA8', /emirates nbd|\benbd\b/i),
  B('ei', 'Emirates Islamic', 'emiratesislamic.ae', '#0B6B5D', '#05372F', /emirates islamic/i),
  B('adcb', 'ADCB', 'adcb.com', '#D71920', '#3B0507', /adcb|abu dhabi commercial/i),
  B('adib', 'ADIB', 'adib.ae', '#00539B', '#002A4E', /adib|abu dhabi islamic/i),
  B('fab', 'FAB', 'bankfab.com', '#00205B', '#1E5BAA', /\bfab\b|first abu dhabi/i),
  B('mashreq', 'Mashreq', 'mashreq.com', '#F15A22', '#8E2C08', /mashreq/i),
  B('dib', 'Dubai Islamic Bank', 'dib.ae', '#00843D', '#00401D', /dubai islamic|\bdib\b/i),
  B('rak', 'RAKBANK', 'rakbank.ae', '#D8121B', '#6E0309', /rak ?bank/i),
  B('cbd', 'CBD', 'cbd.ae', '#00447C', '#0076C0', /\bcbd\b|commercial bank of dubai/i),
  B('liv', 'Liv', 'liv.me', '#13B5C8', '#6A2DBE', /\bliv\b/i),
  B('wio', 'Wio', 'wio.io', '#1B1B3A', '#5B3DF5', /\bwio\b/i),
  B('hsbc', 'HSBC', 'hsbc.com', '#DB0011', '#5C0007', /hsbc/i),
  B('citi', 'Citi', 'citibank.com', '#003B70', '#056DAE', /\bciti/i),
  B('sc', 'Standard Chartered', 'sc.com', '#0473EA', '#0B7A3E', /standard chartered|\bscb\b/i),
  B('amex', 'American Express', 'americanexpress.com', '#006FCF', '#00175A', /amex|american express/i),
  B('revolut', 'Revolut', 'revolut.com', '#0666EB', '#191C1F', /revolut/i),
  B('wise', 'Wise', 'wise.com', '#163300', '#2F5A0A', /\bwise\b/i),
]
export const LOGO_DOMAINS = new Set(BRANDS.map(b => b.domain))

const FALLBACK = [['#5B47D6', '#2A1F7A'], ['#0F766E', '#063B37'], ['#1E3A8A', '#0B1A45'], ['#9D174D', '#4A0A25'], ['#334155', '#0F172A']]

export function brandOf(bankName?: string | null, accountName?: string | null): Brand {
  const text = `${bankName ?? ''} ${accountName ?? ''}`
  const b = BRANDS.find(x => x.re.test(text))
  if (b) return { key: b.key, label: b.label, domain: b.domain, c1: b.c1, c2: b.c2 }
  const name = (bankName || accountName || 'Bank').trim()
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [c1, c2] = FALLBACK[h % FALLBACK.length]
  return { key: 'other', label: name, domain: null, c1, c2 }
}

export type Network = 'visa' | 'mastercard' | 'amex' | 'rupay' | 'diners' | null
export function networkOf(saved?: string | null, ...names: (string | null | undefined)[]): Network {
  const t = `${saved ?? ''} ${names.join(' ')}`.toLowerCase()
  if (/american express|amex/.test(t)) return 'amex'
  if (/master/.test(t)) return 'mastercard'
  if (/visa|infinite|signature/.test(t)) return 'visa'
  if (/rupay/.test(t)) return 'rupay'
  if (/diners/.test(t)) return 'diners'
  return null
}

// Premium card names get a dark "metal" finish
export const isPremium = (name?: string | null) => /infinite|signature|reserve|magnus|black|world elite|metal|centurion|privilege|skywards|platinum|emeralde|diners/i.test(name ?? '')
