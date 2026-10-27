// Receipts (migration 027): a photo or PDF kept in the private "receipts"
// bucket under <user id>/<transaction id>/, opened with a link that expires
// after 10 minutes. Nothing is read by AI.
export const RECEIPT_TYPES = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'
const MAX = 10 * 1024 * 1024
const hint = (msg: string) => /bucket|not found|receipt_path/i.test(msg) ? 'Run migration 027 in Supabase to keep receipts.' : msg

async function setPath(id: string, receipt_path: string | null) {
  const res = await fetch('/api/transactions', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, receipt_path }),
  })
  const data = await res.json().catch(() => ({}))
  return res.ok && (receipt_path === null || data.transaction?.receipt_path === receipt_path) ? null : hint(data.error ?? 'receipt_path')
}

export async function uploadReceipt(supabase: any, txnId: string, file: File): Promise<string | null> {
  if (file.size > MAX) return 'Receipts can be up to 10 MB.'
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Signed out'
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  const path = `${user.id}/${txnId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type || undefined })
  if (error) return hint(error.message)
  const err = await setPath(txnId, path)
  if (err) await supabase.storage.from('receipts').remove([path])
  return err
}

export async function openReceipt(supabase: any, path: string) {
  // Open the tab first (synchronously) so pop-up blockers allow it
  const tab = window.open('', '_blank')
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 600)
  if (data?.signedUrl && tab) tab.location.href = data.signedUrl
  else { tab?.close(); return hint(error?.message ?? 'Could not open the receipt') }
  return null
}

export async function removeReceipt(supabase: any, txnId: string, path: string) {
  const err = await setPath(txnId, null)
  if (!err) await supabase.storage.from('receipts').remove([path])
  return err
}
