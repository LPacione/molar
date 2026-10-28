import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata = { title: 'Crear cuenta | Molar' }
export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const configured = isSupabaseConfigured()

  if (configured) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect('/')
  }

  return <AuthShell mode="register" configured={configured} />
}
