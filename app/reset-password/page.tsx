import { AuthShell } from '@/components/auth-shell'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata = { title: 'Nueva contraseña | Molar' }
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  const configured = isSupabaseConfigured()
  let validSession = false

  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    validSession = Boolean(user)
  }

  return (
    <AuthShell
      mode="reset"
      configured={configured}
      validSession={validSession}
      initialError={
        validSession
          ? undefined
          : 'Abrí el enlace de recuperación que recibiste por email para elegir una nueva contraseña.'
      }
    />
  )
}
