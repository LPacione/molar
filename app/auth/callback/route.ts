import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl, isSupabaseConfigured, safeRedirectPath } from '@/lib/supabase/config'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeRedirectPath(url.searchParams.get('next'))
  const origin = getSiteUrl(url.origin)

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(new URL('/login?error=auth', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Error al validar el enlace de autenticación:', error.message)
    return NextResponse.redirect(new URL('/login?error=expired', origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}
