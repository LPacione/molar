const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)?.trim()

export type SupabaseConfig = {
  url: string
  key: string
}

export const SUPABASE_CONFIG_MESSAGE =
  'Supabase todavía no está configurado. Agregá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) para habilitar el modo autenticado.'

export function getSupabaseConfig(): SupabaseConfig | null {
  if (!url || !key) return null
  if (!/^https?:\/\//i.test(url)) return null
  if (key.length < 20) return null
  return { url, key }
}

export function isSupabaseConfigured() {
  return getSupabaseConfig() !== null
}

export function getSiteUrl(fallbackOrigin?: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, '')
  return 'http://localhost:3000'
}

export function safeRedirectPath(value: string | null | undefined) {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}
