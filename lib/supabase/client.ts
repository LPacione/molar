'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseConfig } from './config'

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserSupabase() {
  const config = getSupabaseConfig()
  if (!config) return null
  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.key)
  }
  return browserClient
}
