import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { todayIso } from '@/lib/format'
import type {
  Appointment,
  Consultation,
  DocumentRow,
  DocumentWithUrl,
  OdontogramFinding,
  Patient,
  Practice,
  PracticeSettings,
  Profile,
  ScheduleBlock,
  ToothEvent,
  TreatmentPlan,
  WorkspaceResult,
} from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

async function loadIdentity(supabase: ServerClient, user: User) {
  let profile: Profile | null = null
  let practice: Practice | null = null

  const profileResult = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const practiceResult = await supabase
    .from('practices')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  profile = profileResult.data as Profile | null
  practice = practiceResult.data as Practice | null

  if (!profile || !practice) {
    // Recupera cuentas creadas antes de la migración o si el trigger falló.
    const bootstrap = await supabase.rpc('ensure_workspace')
    if (bootstrap.error) {
      console.error('No se pudo inicializar el espacio de trabajo:', bootstrap.error.message)
    } else {
      const [retryProfile, retryPractice] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase
          .from('practices')
          .select('*')
          .eq('owner_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ])
      profile = retryProfile.data as Profile | null
      practice = retryPractice.data as Practice | null
    }
  }

  return { profile, practice }
}

async function loadWorkspace(): Promise<WorkspaceResult> {
  if (!isSupabaseConfigured()) return { status: 'unconfigured' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { status: 'unauthenticated' }

  const { profile, practice } = await loadIdentity(supabase, user)
  if (!profile || !practice) {
    return {
      status: 'incomplete',
      message:
        'No pudimos cargar tu perfil y consultorio. Verificá que la migración de Supabase esté aplicada y volvé a iniciar sesión.',
    }
  }

  const practiceId = practice.id

  const [
    settingsResult,
    patientsResult,
    appointmentsResult,
    consultationsResult,
    findingsResult,
    plansResult,
    documentsResult,
    blocksResult,
    toothEventsResult,
  ] = await Promise.all([
    supabase.from('practice_settings').select('*').eq('practice_id', practiceId).maybeSingle(),
    supabase
      .from('patients')
      .select('*')
      .eq('practice_id', practiceId)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true }),
    supabase
      .from('appointments')
      .select('*')
      .eq('practice_id', practiceId)
      .order('appointment_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('consultations')
      .select('*')
      .eq('practice_id', practiceId)
      .order('consultation_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('odontogram_findings').select('*').eq('practice_id', practiceId),
    supabase
      .from('treatment_plans')
      .select('*')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('documents')
      .select('*')
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false }),
    supabase
      .from('schedule_blocks')
      .select('*')
      .eq('practice_id', practiceId)
      .order('block_date', { ascending: true }),
    supabase
      .from('tooth_events')
      .select('*')
      .eq('practice_id', practiceId)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const toothEventsError = toothEventsResult.error
  const toothEventsAvailable = !toothEventsError
  const toothEventsMissing =
    toothEventsError?.code === '42P01' ||
    toothEventsError?.message.toLowerCase().includes('does not exist')

  if (toothEventsError && !toothEventsMissing) {
    console.error('No se pudo cargar el historial del odontograma:', toothEventsError.message)
  }

  const firstError = [
    settingsResult.error,
    patientsResult.error,
    appointmentsResult.error,
    consultationsResult.error,
    findingsResult.error,
    plansResult.error,
    documentsResult.error,
    blocksResult.error,
  ].find(Boolean)

  if (firstError) {
    console.error('No se pudo cargar el consultorio:', firstError.message)
    return {
      status: 'incomplete',
      message:
        'No pudimos cargar los datos de tu consultorio. Revisá la configuración de la base de datos e intentá nuevamente.',
    }
  }

  const settings: PracticeSettings = {
    practice_id: practiceId,
    default_duration_minutes: settingsResult.data?.default_duration_minutes ?? 45,
    workday_start: settingsResult.data?.workday_start ?? '08:00:00',
    workday_end: settingsResult.data?.workday_end ?? '18:00:00',
    cancellation_policy: settingsResult.data?.cancellation_policy ?? '',
  }

  const rawDocuments = (documentsResult.data ?? []) as DocumentRow[]
  const documents: DocumentWithUrl[] = await Promise.all(
    rawDocuments.map(async (document) => {
      const signed = await supabase.storage
        .from('documents')
        .createSignedUrl(document.storage_path, 60 * 60)
      return {
        ...document,
        signed_url: signed.data?.signedUrl ?? null,
      }
    }),
  )

  const rawFindings = (findingsResult.data ?? []) as Array<
    Omit<OdontogramFinding, 'condition' | 'event_date'> & {
      condition?: string | null
      event_date?: string | null
    }
  >
  const toothEvents = toothEventsAvailable
    ? ((toothEventsResult.data ?? []) as ToothEvent[])
    : []

  // El estado actual del odontograma es el último evento de cada pieza.
  // Si la migración todavía no está aplicada, se conserva el comportamiento
  // anterior leyendo odontogram_findings.
  const findings: OdontogramFinding[] = toothEventsAvailable
    ? Array.from(
        toothEvents
          .reduce((latest, event) => {
            const key = `${event.patient_id}:${event.tooth_number}`
            if (!latest.has(key)) latest.set(key, event)
            return latest
          }, new Map<string, ToothEvent>())
          .values(),
      ).map((event) => ({
        id: event.id,
        practice_id: event.practice_id,
        patient_id: event.patient_id,
        tooth_number: event.tooth_number,
        status: event.status,
        condition: event.condition,
        notes: event.notes,
        event_date: event.event_date,
        updated_at: event.created_at,
      }))
    : rawFindings.map((finding) => ({
        ...finding,
        condition: finding.condition ?? null,
        event_date: finding.event_date ?? finding.updated_at.slice(0, 10),
      }))

  return {
    status: 'ok',
    data: {
      userId: user.id,
      profile,
      practice,
      settings,
      patients: (patientsResult.data ?? []) as Patient[],
      appointments: (appointmentsResult.data ?? []) as Appointment[],
      consultations: (consultationsResult.data ?? []) as Consultation[],
      findings,
      toothEvents,
      treatmentPlans: (plansResult.data ?? []) as TreatmentPlan[],
      documents,
      scheduleBlocks: (blocksResult.data ?? []) as ScheduleBlock[],
      today: todayIso(),
    },
  }
}

export async function getWorkspace(): Promise<WorkspaceResult> {
  try {
    return await loadWorkspace()
  } catch (error) {
    console.error('No se pudo abrir el workspace:', error)
    return {
      status: 'incomplete',
      message:
        'No pudimos conectar con tu espacio de trabajo. Revisá tu conexión y la configuración de Supabase, luego volvé a intentar.',
    }
  }
}
