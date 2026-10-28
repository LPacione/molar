import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseConfig } from '@/lib/supabase/config'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/demo',
  '/turno',
  '/api/turno',
]

const AUTH_PATHS = ['/login', '/register', '/forgot-password']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function isAuthForm(pathname: string) {
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig()
  if (!config) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  let user = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    console.error('No se pudo verificar la sesión en el proxy:', error)
  }

  const { pathname, search } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return withRefreshedCookies(NextResponse.redirect(loginUrl), response)
  }

  if (user && isAuthForm(pathname)) {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    homeUrl.search = ''
    return withRefreshedCookies(NextResponse.redirect(homeUrl), response)
  }

  return response
}

function withRefreshedCookies(target: NextResponse, source: NextResponse) {
  source.headers.getSetCookie().forEach((cookie) => {
    target.headers.append('set-cookie', cookie)
  })
  return target
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2)$).*)',
  ],
}
