import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata = { title: 'Recuperar contraseña | Molar' }
export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage() {
  const configured = isSupabaseConfigured()

  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect('/')
  }

  return <AuthShell mode="forgot" configured={configured} />
}
