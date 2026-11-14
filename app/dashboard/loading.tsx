import OverviewSkeleton from '@/components/ui/OverviewSkeleton'

// Home (and any page without its own): the overview's shape while it loads,
// so content doesn't jump in
export default function Loading() {
  return <div className="max-w-[1280px] mx-auto"><OverviewSkeleton /></div>
}
