'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/format'
import { getAvailableSlots } from '@/lib/schedule'
import type {
  ActionResult,
  Appointment,
  AppointmentInput,
  AppointmentStatus,
  ConsultationInput,
  EvolutionToothInput,
  PatientInput,
  ScheduleBlock,
  SettingsInput,
  ToothFindingInput,
  ToothStatus,
  TreatmentPlanInput,
} from '@/lib/types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'confirmado',
  'pendiente',
  'en_atencion',
  'atendido',
  'cancelado',
  'no_asistio',
]
const INITIAL_APPOINTMENT_STATUSES: AppointmentStatus[] = ['confirmado', 'pendiente']
const TREATMENT_STATUSES = ['pendiente', 'en_curso', 'completado'] as const
const TOOTH_STATUSES = ['sano', 'hallazgo', 'tratado'] as const
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function clean(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function optional(value: unknown, maxLength = 2000) {
  const result = clean(value, maxLength)
  return result || null
}

function validDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validTime(value: string) {
  return TIME_PATTERN.test(value)
}

function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value
}

function validUuid(value: string) {
  return UUID_PATTERN.test(value)
}

function validToothNumber(value: number) {
  if (!Number.isInteger(value) || value < 11 || value > 48) return false
  const quadrant = Math.floor(value / 10)
  const tooth = value % 10
  return quadrant >= 1 && quadrant <= 4 && tooth >= 1 && tooth <= 8
}

function missingRelation(error: { code?: string; message: string }) {
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.message.toLowerCase().includes('does not exist') ||
    error.message.toLowerCase().includes('could not find')
  )
}

function validWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

function fail(error: string): ActionResult {
  return { ok: false, error }
}

async function requireContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Tu sesión venció. Volvé a iniciar sesión.' as const }
  }

  const { data: practice } = await supabase
    .from('practices')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!practice) {
    await supabase.rpc('ensure_workspace')
    const retry = await supabase
      .from('practices')
      .select('id')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!retry.data) {
      return {
        error:
          'No encontramos tu consultorio. Verificá que la migración de Supabase esté aplicada.' as const,
      }
    }

    return { supabase, user, practiceId: retry.data.id as string }
  }

  return { supabase, user, practiceId: practice.id as string }
}

async function patientBelongsToPractice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  practiceId: string,
) {
  if (!validUuid(patientId)) return false
  const { data } = await supabase
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  return Boolean(data)
}

export async function createPatientAction(input: PatientInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const firstName = clean(input.first_name, 80)
  const lastName = clean(input.last_name, 80)
  const phone = clean(input.phone, 40)
  const email = clean(input.email, 160)
  const birthDate = clean(input.birth_date, 10)

  if (firstName.length < 2) return fail('Ingresá el nombre del paciente.')
  if (lastName.length < 2) return fail('Ingresá el apellido del paciente.')
  if (!validWhatsApp(phone)) {
    return fail('Ingresá un WhatsApp válido con código de país.')
  }
  if (email && !EMAIL_PATTERN.test(email)) return fail('El email del paciente no es válido.')
  if (birthDate && !validDate(birthDate)) return fail('La fecha de nacimiento no es válida.')

  const { error } = await context.supabase.from('patients').insert({
    practice_id: context.practiceId,
    first_name: firstName,
    last_name: lastName,
    phone,
    email: optional(email, 160),
    birth_date: birthDate || null,
    allergies: optional(input.allergies, 500),
    medical_history: optional(input.medical_history, 2000),
  })

  if (error) {
    console.error('Error al crear paciente:', error.message)
    return fail('No pudimos guardar el paciente. Intentá nuevamente.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function updatePatientAction(
  patientId: string,
  input: PatientInput,
): Promise<ActionResult> {
  if (!validUuid(patientId)) return fail('El paciente indicado no es válido.')
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const firstName = clean(input.first_name, 80)
  const lastName = clean(input.last_name, 80)
  const phone = clean(input.phone, 40)
  const email = clean(input.email, 160)
  const birthDate = clean(input.birth_date, 10)

  if (firstName.length < 2) return fail('Ingresá el nombre del paciente.')
  if (lastName.length < 2) return fail('Ingresá el apellido del paciente.')
  if (!validWhatsApp(phone)) {
    return fail('Ingresá un WhatsApp válido con código de país.')
  }
  if (email && !EMAIL_PATTERN.test(email)) return fail('El email del paciente no es válido.')
  if (birthDate && !validDate(birthDate)) return fail('La fecha de nacimiento no es válida.')

  const { data, error } = await context.supabase
    .from('patients')
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      email: optional(email, 160),
      birth_date: birthDate || null,
      allergies: optional(input.allergies, 500),
      medical_history: optional(input.medical_history, 2000),
    })
    .eq('id', patientId)
    .eq('practice_id', context.practiceId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Error al actualizar paciente:', error.message)
    return fail('No pudimos actualizar el paciente. Intentá nuevamente.')
  }
  if (!data) return fail('El paciente no existe o no tenés acceso.')

  revalidatePath('/')
  return { ok: true }
}

export async function createAppointmentAction(input: AppointmentInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const reason = clean(input.reason, 300)
  const date = clean(input.appointment_date, 10)
  const time = clean(input.start_time, 8)
  const duration = Number(input.duration_minutes)
  const status = input.status

  if (!(await patientBelongsToPractice(context.supabase, input.patient_id, context.practiceId))) {
    return fail('El paciente seleccionado no pertenece a tu consultorio.')
  }
  if (!validDate(date)) return fail('Elegí una fecha válida para el turno.')
  if (!validTime(time)) return fail('Elegí una hora válida para el turno.')
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return fail('La duración del turno no es válida.')
  }
  if (!reason) return fail('Indicá el motivo del turno.')
  if (!INITIAL_APPOINTMENT_STATUSES.includes(status)) {
    return fail('El estado inicial del turno no es válido.')
  }

  const normalizedTime = normalizeTime(time)
  const [settingsResult, dayAppointmentsResult, dayBlocksResult] = await Promise.all([
    context.supabase
      .from('practice_settings')
      .select('workday_start, workday_end')
      .eq('practice_id', context.practiceId)
      .maybeSingle(),
    context.supabase
      .from('appointments')
      .select('appointment_date, start_time, duration_minutes, status')
      .eq('practice_id', context.practiceId)
      .eq('appointment_date', date),
    context.supabase
      .from('schedule_blocks')
      .select('block_date, start_time, end_time')
      .eq('practice_id', context.practiceId)
      .eq('block_date', date),
  ])

  if (settingsResult.error || dayAppointmentsResult.error || dayBlocksResult.error) {
    console.error(
      'No se pudo verificar la disponibilidad del turno:',
      settingsResult.error?.message ??
        dayAppointmentsResult.error?.message ??
        dayBlocksResult.error?.message,
    )
    return fail('No pudimos verificar la disponibilidad del horario. Intentá nuevamente.')
  }

  const availableSlots = getAvailableSlots({
    date,
    duration,
    settings: {
      workday_start: settingsResult.data?.workday_start ?? '08:00:00',
      workday_end: settingsResult.data?.workday_end ?? '18:00:00',
    },
    appointments: (dayAppointmentsResult.data ?? []) as Appointment[],
    scheduleBlocks: (dayBlocksResult.data ?? []) as ScheduleBlock[],
  })

  if (!availableSlots.includes(normalizedTime.slice(0, 5))) {
    return fail('Ese horario ya no está disponible. Elegí otro horario o fecha.')
  }

  const { data, error } = await context.supabase
    .from('appointments')
    .insert({
      practice_id: context.practiceId,
      patient_id: input.patient_id,
      appointment_date: date,
      start_time: normalizedTime,
      duration_minutes: duration,
      reason,
      status,
      notes: optional(input.notes, 2000),
    })
    .select('*')
    .single()

  if (error) {
    console.error('Error al crear turno:', error.message)
    return fail('No pudimos guardar el turno. Intentǭ nuevamente.')
  }

  revalidatePath('/')
  return { ok: true, appointment: data as Appointment }
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: AppointmentStatus,
): Promise<ActionResult> {
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  if (!validUuid(appointmentId)) return fail('El turno indicado no es válido.')
  if (!APPOINTMENT_STATUSES.includes(status)) return fail('El estado del turno no es válido.')

  if (status === 'atendido') {
    const noteResult = await context.supabase
      .from('consultations')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('practice_id', context.practiceId)
      .maybeSingle()

    if (noteResult.error && missingRelation(noteResult.error)) {
      return fail('Falta aplicar la migración de historia clínica en Supabase.')
    }
    if (noteResult.error) {
      console.error('Error al verificar evolución del turno:', noteResult.error.message)
      return fail('No pudimos verificar la evolución del turno.')
    }
    if (!noteResult.data) {
      return fail('Registrá la evolución clínica antes de marcar el turno como atendido.')
    }
  }

  const { error } = await context.supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
    .eq('practice_id', context.practiceId)

  if (error) {
    console.error('Error al actualizar turno:', error.message)
    return fail('No pudimos actualizar el turno.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function createConsultationAction(input: ConsultationInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const appointmentId = clean(input.appointment_id, 40)
  let date = clean(input.consultation_date, 10)
  let reason = clean(input.reason, 300)
  const procedure = clean(input.procedure, 500)
  const nextStep = clean(input.next_step, 300)
  const requestedToothEvents = Array.isArray(input.tooth_events) ? input.tooth_events : []
  const toothEvents = new Map<
    number,
    { status: ToothStatus; condition: string | null; notes: string | null }
  >()

  for (const item of requestedToothEvents) {
    if (!item || typeof item !== 'object') return fail('Los datos de la pieza dental no son válidos.')
    const tooth = Number((item as EvolutionToothInput).tooth_number)
    if (!validToothNumber(tooth)) {
      return fail('Revisá las piezas dentales: usá numeración FDI de dos dígitos (ej. 15, 16).')
    }
    if (!TOOTH_STATUSES.includes((item as EvolutionToothInput).status)) {
      return fail('El estado de una de las piezas dentales no es válido.')
    }
    toothEvents.set(tooth, {
      status: (item as EvolutionToothInput).status,
      condition: optional((item as EvolutionToothInput).condition, 120),
      notes: optional((item as EvolutionToothInput).notes, 1000),
    })
  }

  if (!requestedToothEvents.length) {
    const toothNumbers = Array.from(
      new Set((Array.isArray(input.tooth_numbers) ? input.tooth_numbers : []).map(Number)),
    )
    for (const tooth of toothNumbers) {
      if (!validToothNumber(tooth)) {
        return fail(
          'Revisá las piezas dentales: usá numeración FDI de dos dígitos separada por coma (ej. 15, 16).',
        )
      }
      toothEvents.set(tooth, {
        status: 'tratado',
        condition: optional(procedure, 120) ?? reason,
        notes: optional(input.notes, 1000),
      })
    }
  }

  if (!(await patientBelongsToPractice(context.supabase, input.patient_id, context.practiceId))) {
    return fail('El paciente seleccionado no pertenece a tu consultorio.')
  }
  if (toothEvents.size > 32) return fail('Seleccioná como máximo 32 piezas dentales.')

  type EvolutionAppointment = {
    id: string
    patient_id: string
    appointment_date: string
    status: AppointmentStatus
  }
  let appointmentToClose: EvolutionAppointment | null = null

  if (appointmentId) {
    if (!validUuid(appointmentId)) return fail('El turno indicado no es válido.')

    const appointmentResult = await context.supabase
      .from('appointments')
      .select('id, patient_id, appointment_date, status')
      .eq('id', appointmentId)
      .eq('practice_id', context.practiceId)
      .maybeSingle()

    if (appointmentResult.error) {
      console.error('Error al buscar turno para evolución:', appointmentResult.error.message)
      return fail('No pudimos verificar el turno. Intentá nuevamente.')
    }
    if (!appointmentResult.data) return fail('El turno no existe o no tenés acceso.')
    const foundAppointment = appointmentResult.data as EvolutionAppointment
    appointmentToClose = foundAppointment
    if (foundAppointment.patient_id !== input.patient_id) {
      return fail('El turno no corresponde al paciente seleccionado.')
    }
    if (['cancelado', 'no_asistio'].includes(foundAppointment.status)) {
      return fail('No se puede registrar una evolución para un turno cancelado o no asistido.')
    }
    if (foundAppointment.appointment_date > todayIso()) {
      return fail('Todavía no podés registrar la evolución de un turno futuro.')
    }
    if (!date) date = foundAppointment.appointment_date
    if (!reason) reason = 'Evolución de turno'

    const existingResult = await context.supabase
      .from('consultations')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (existingResult.error && missingRelation(existingResult.error)) {
      return fail('Falta aplicar la migración de historia clínica en Supabase.')
    }
    if (existingResult.error) {
      console.error('Error al verificar evolución existente:', existingResult.error.message)
      return fail('No pudimos verificar la evolución del turno. Intentá nuevamente.')
    }
    if (existingResult.data) return fail('Este turno ya tiene una evolución registrada.')
  }

  if (!validDate(date)) return fail('Elegí una fecha válida para la consulta.')
  if (!reason) return fail('Indicá el motivo de la consulta.')

  const { data: inserted, error } = await context.supabase
    .from('consultations')
    .insert({
      practice_id: context.practiceId,
      patient_id: input.patient_id,
      appointment_id: appointmentId || null,
      consultation_date: date,
      reason,
      procedure: optional(procedure, 500),
      next_step: optional(nextStep, 300),
      notes: optional(input.notes, 4000),
      diagnosis: optional(input.diagnosis, 2000),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return fail('Este turno ya tiene una evolución registrada.')
    console.error('Error al crear consulta:', error.message)
    return fail('No pudimos guardar la consulta. Intentá nuevamente.')
  }

  if (appointmentToClose) {
    const { error: statusError } = await context.supabase
      .from('appointments')
      .update({ status: 'atendido' })
      .eq('id', appointmentToClose.id)
      .eq('practice_id', context.practiceId)

    if (statusError) {
      await context.supabase
        .from('consultations')
        .delete()
        .eq('id', inserted.id)
        .eq('practice_id', context.practiceId)
      console.error('Error al cerrar turno con evolución:', statusError.message)
      return fail('No pudimos cerrar el turno. Intentá nuevamente.')
    }
  }

  if (toothEvents.size) {
    const { error: toothError } = await context.supabase.from('tooth_events').insert(
      Array.from(toothEvents.entries()).map(([tooth, event]) => ({
        practice_id: context.practiceId,
        patient_id: input.patient_id,
        tooth_number: tooth,
        appointment_id: appointmentId || null,
        consultation_id: inserted.id,
        event_date: date,
        status: event.status,
        condition: event.condition,
        notes: event.notes,
        created_by: context.user.id,
      })),
    )

    if (toothError) {
      if (appointmentToClose) {
        await context.supabase
          .from('appointments')
          .update({ status: appointmentToClose.status })
          .eq('id', appointmentToClose.id)
          .eq('practice_id', context.practiceId)
      }
      await context.supabase
        .from('consultations')
        .delete()
        .eq('id', inserted.id)
        .eq('practice_id', context.practiceId)
      if (missingRelation(toothError)) {
        return fail('Falta aplicar la migración del odontograma histórico en Supabase.')
      }
      console.error('Error al guardar piezas tratadas:', toothError.message)
      return fail('No pudimos guardar las piezas tratadas. Intentá nuevamente.')
    }
  }

  revalidatePath('/')
  return { ok: true }
}

export async function saveToothFindingAction(input: ToothFindingInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const tooth = Number(input.tooth_number)
  if (!validToothNumber(tooth)) return fail('La pieza dental no es válida.')
  if (!TOOTH_STATUSES.includes(input.status)) return fail('El estado de la pieza no es válido.')
  if (!(await patientBelongsToPractice(context.supabase, input.patient_id, context.practiceId))) {
    return fail('El paciente seleccionado no pertenece a tu consultorio.')
  }

  const { error } = await context.supabase.from('tooth_events').insert({
    practice_id: context.practiceId,
    patient_id: input.patient_id,
    tooth_number: tooth,
    event_date: todayIso(),
    status: input.status,
    condition: optional(input.condition, 120),
    notes: optional(input.notes, 1000),
    created_by: context.user.id,
  })

  if (error) {
    if (missingRelation(error)) {
      // Compatibilidad mientras no se aplicó la migración de historial.
      const fallback = await context.supabase.from('odontogram_findings').upsert(
        {
          practice_id: context.practiceId,
          patient_id: input.patient_id,
          tooth_number: tooth,
          status: input.status,
          notes: optional(input.notes, 1000),
        },
        { onConflict: 'patient_id,tooth_number' },
      )
      if (fallback.error) {
        console.error('Error al guardar hallazgo:', fallback.error.message)
        return fail('No pudimos guardar el hallazgo del odontograma.')
      }
      revalidatePath('/')
      return { ok: true }
    }
    console.error('Error al guardar evento del odontograma:', error.message)
    return fail('No pudimos guardar el hallazgo del odontograma.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function createTreatmentPlanAction(input: TreatmentPlanInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const name = clean(input.name, 160)
  const progress = Number(input.progress)
  const status = input.status

  if (!(await patientBelongsToPractice(context.supabase, input.patient_id, context.practiceId))) {
    return fail('El paciente seleccionado no pertenece a tu consultorio.')
  }
  if (!name) return fail('Indicá el nombre del tratamiento.')
  if (!TREATMENT_STATUSES.includes(status)) return fail('El estado del tratamiento no es válido.')
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return fail('El progreso debe estar entre 0 y 100.')
  }

  const { error } = await context.supabase.from('treatment_plans').insert({
    practice_id: context.practiceId,
    patient_id: input.patient_id,
    name,
    status,
    progress,
    next_step: optional(input.next_step, 160),
    notes: optional(input.notes, 2000),
  })

  if (error) {
    console.error('Error al crear tratamiento:', error.message)
    return fail('No pudimos guardar el plan de tratamiento.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function saveSettingsAction(input: SettingsInput): Promise<ActionResult> {
  if (!input || typeof input !== 'object') return fail('Los datos enviados no son válidos.')
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const fullName = clean(input.full_name, 120)
  const practiceName = clean(input.practice_name, 80)
  const duration = Number(input.default_duration_minutes)
  const workdayStart = clean(input.workday_start, 8)
  const workdayEnd = clean(input.workday_end, 8)
  const cancellationPolicy = clean(input.cancellation_policy, 1000)

  if (fullName.length < 3) return fail('Ingresá el nombre del profesional.')
  if (practiceName.length < 2) return fail('Ingresá el nombre del consultorio.')
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    return fail('La duración predeterminada no es válida.')
  }
  if (!validTime(workdayStart) || !validTime(workdayEnd)) {
    return fail('Los horarios de atención no son válidos.')
  }
  if (normalizeTime(workdayEnd) <= normalizeTime(workdayStart)) {
    return fail('El fin de atención debe ser posterior al inicio.')
  }

  const [profileResult, practiceResult, settingsResult] = await Promise.all([
    context.supabase
      .from('profiles')
      .update({ full_name: fullName, phone: optional(input.phone, 40) })
      .eq('id', context.user.id),
    context.supabase
      .from('practices')
      .update({ name: practiceName, phone: optional(input.phone, 40) })
      .eq('id', context.practiceId),
    context.supabase.from('practice_settings').upsert(
      {
        practice_id: context.practiceId,
        default_duration_minutes: duration,
        workday_start: normalizeTime(workdayStart),
        workday_end: normalizeTime(workdayEnd),
        cancellation_policy: cancellationPolicy,
      },
      { onConflict: 'practice_id' },
    ),
  ])

  const error = profileResult.error ?? practiceResult.error ?? settingsResult.error
  if (error) {
    console.error('Error al guardar configuración:', error.message)
    if (error.message.includes('cancellation_policy')) {
      return fail(
        'Falta aplicar la migración de ausencias y política de cancelación en Supabase.',
      )
    }
    return fail('No pudimos guardar la configuración. Intentá nuevamente.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function uploadDocumentAction(formData: FormData): Promise<ActionResult> {
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)

  const patientId = clean(formData.get('patient_id'), 40)
  const file = formData.get('file')

  if (!(await patientBelongsToPractice(context.supabase, patientId, context.practiceId))) {
    return fail('El paciente seleccionado no pertenece a tu consultorio.')
  }
  if (!(file instanceof File) || file.size === 0) {
    return fail('Seleccioná un archivo para subir.')
  }
  if (file.size > MAX_FILE_BYTES) {
    return fail('El archivo supera el límite de 10 MB.')
  }
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return fail('Sólo se permiten PDF, JPG, PNG o WEBP.')
  }

  const safeName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-100)
  const storagePath = `${context.practiceId}/${patientId}/${crypto.randomUUID()}-${safeName || 'archivo'}`
  const contentType = file.type || 'application/octet-stream'

  const upload = await context.supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType, upsert: false })

  if (upload.error) {
    console.error('Error al subir documento:', upload.error.message)
    return fail('No pudimos subir el archivo. Verificá el bucket "documents" de Supabase.')
  }

  const { error } = await context.supabase.from('documents').insert({
    practice_id: context.practiceId,
    patient_id: patientId,
    name: file.name.slice(0, 200),
    storage_path: storagePath,
    mime_type: contentType,
    size_bytes: file.size,
  })

  if (error) {
    console.error('Error al registrar documento:', error.message)
    await context.supabase.storage.from('documents').remove([storagePath])
    return fail('No pudimos registrar el documento.')
  }

  revalidatePath('/')
  return { ok: true }
}

export async function deleteDocumentAction(documentId: string): Promise<ActionResult> {
  const context = await requireContext()
  if ('error' in context && typeof context.error === 'string') return fail(context.error)
  if (!validUuid(documentId)) return fail('El documento indicado no es válido.')

  const { data: document } = await context.supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('practice_id', context.practiceId)
    .maybeSingle()

  if (!document) return fail('El documento no existe o no tenés acceso.')

  const { error } = await context.supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('practice_id', context.practiceId)

  if (error) {
    console.error('Error al eliminar documento:', error.message)
    return fail('No pudimos eliminar el documento.')
  }

  await context.supabase.storage.from('documents').remove([document.storage_path])
  revalidatePath('/')
  return { ok: true }
}
