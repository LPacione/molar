import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublicAppointment = {
  appointment_date: string
  start_time: string
  duration_minutes: number
  reason: string
  status: string
  practice_name: string
  professional_name: string
  patient_first_name: string
}

export async function getPublicAppointment(token: string): Promise<PublicAppointment | null> {
  if (!UUID_PATTERN.test(token) || !isSupabaseConfigured()) return null

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_public_appointment', {
      p_token: token,
    })

    if (error) {
      console.error('No se pudo cargar el turno público:', error.message)
      return null
    }

    const row = Array.isArray(data) ? data[0] : data
    return (row as PublicAppointment | undefined) ?? null
  } catch (error) {
    console.error('No se pudo cargar el turno público:', error)
    return null
  }
}
