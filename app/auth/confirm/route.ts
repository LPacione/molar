import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl, isSupabaseConfigured, safeRedirectPath } from '@/lib/supabase/config'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = safeRedirectPath(url.searchParams.get('next'))
  const origin = getSiteUrl(url.origin)

  if (!isSupabaseConfigured() || !tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=auth', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

  if (error) {
    console.error('Error al verificar el email:', error.message)
    return NextResponse.redirect(new URL('/login?error=expired', origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}
