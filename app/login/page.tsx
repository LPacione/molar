import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured, safeRedirectPath } from '@/lib/supabase/config'

export const metadata = { title: 'Iniciar sesión | Molar' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams
  const configured = isSupabaseConfigured()
  const next = safeRedirectPath(params.next)

  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect(next)
  }

  const initialError =
    params.error === 'auth'
      ? 'No pudimos validar el enlace de acceso. Pedí uno nuevo o iniciá sesión con tu contraseña.'
      : params.error === 'expired'
        ? 'El enlace venció. Solicitá uno nuevo desde "Olvidé mi contraseña".'
        : undefined

  return (
    <AuthShell
      mode="login"
      configured={configured}
      initialError={initialError}
      next={next}
    />
  )
}
