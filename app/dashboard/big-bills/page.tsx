import { redirect } from 'next/navigation'

// Big bills are now part of the one Bills page
export default function BigBillsPage() {
  redirect('/dashboard/bills')
}
