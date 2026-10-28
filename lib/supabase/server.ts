import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseConfig } from './config'

export async function createClient() {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error('Supabase no está configurado.')
  }

  const cookieStore = await cookies()

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Los Server Components no pueden escribir cookies. El proxy se
          // encarga de renovar la sesión en la siguiente petición.
        }
      },
    },
  })
}

export async function getOptionalClient() {
  if (!getSupabaseConfig()) return null
  return createClient()
}
