import { NextResponse } from 'next/server'
import { getAedInr } from '@/lib/fx'

export async function GET() {
  return NextResponse.json(await getAedInr())
}
