import type { Metadata } from 'next'
import { headers } from 'next/headers'
import {
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileText,
  MapPin,
  Stethoscope,
  User,
} from 'lucide-react'
import {
  googleCalendarUrl,
  publicAppointmentIcsUrl,
} from '@/lib/calendar'
import { formatLongDate, formatTime } from '@/lib/format'
import { getPublicAppointment } from '@/lib/public-appointment'
import { getSiteUrl } from '@/lib/supabase/config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Tu turno | Molar',
  robots: { index: false, follow: false },
}

export default async function PublicAppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const appointment = await getPublicAppointment(token)

  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const origin = host ? `${protocol}://${host}` : getSiteUrl()

  if (!appointment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-[#e3eae6] bg-white p-7 text-center shadow-[0_20px_50px_#1d3b3212]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#fff3da] text-[#b8862d]">
            <CalendarDays />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">Turno no encontrado</h1>
          <p className="mt-3 text-sm leading-6 text-[#7f8d87]">
            El enlace puede haber vencido o el turno ya no está disponible. Contactá al
            consultorio para recibir un enlace nuevo.
          </p>
        </section>
      </main>
    )
  }

  const title = `Turno odontológico en ${appointment.practice_name}`
  const details = [
    `Paciente: ${appointment.patient_first_name}`,
    `Profesional: ${appointment.professional_name}`,
    `Motivo: ${appointment.reason}`,
    `Duración: ${appointment.duration_minutes} minutos`,
  ].join('\n')
  const calendarInput = {
    date: appointment.appointment_date,
    startTime: appointment.start_time,
    durationMinutes: appointment.duration_minutes,
    title,
    details,
    location: appointment.practice_name,
  }
  const googleUrl = googleCalendarUrl(calendarInput)
  const icsUrl = publicAppointmentIcsUrl(origin, token)
  const canceled = appointment.status === 'cancelado'
  const absent = appointment.status === 'no_asistio'
  const inactive = canceled || absent

  return (
    <main className="min-h-screen bg-[#f7f8f6] px-4 py-10 text-[#1f2b2a]">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-7 flex items-center gap-2.5">
          <div className="logo-mark">
            <span />
            <span />
          </div>
          <span className="text-[20px] font-semibold tracking-[-0.04em]">molar</span>
        </div>

        <section className="rounded-3xl border border-[#e3eae6] bg-white p-6 shadow-[0_20px_50px_#1d3b3212] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#4e9583]">
                {absent ? 'Turno no asistido' : canceled ? 'Turno cancelado' : 'Tu turno'}
              </p>
              <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.04em]">
                {absent
                  ? 'Este turno quedó como no asistido'
                  : canceled
                    ? 'Este turno fue cancelado'
                    : `Hola, ${appointment.patient_first_name}`}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[#7f8d87]">
                {inactive
                  ? 'Si necesitás reprogramar, contactá al consultorio.'
                  : `Te esperamos en ${appointment.practice_name}.`}
              </p>
            </div>
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
                inactive ? 'bg-[#fae6e7] text-[#bc6468]' : 'bg-[#d8eee8] text-[#247264]'
              }`}
            >
              {inactive ? <CalendarDays /> : <Check />}
            </div>
          </div>

          <div className="mt-7 grid gap-2.5">
            <div className="flex items-start gap-3 rounded-xl bg-[#f8faf9] p-3.5">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-[#4e9583]" />
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa7a2]">
                  Fecha
                </span>
                <strong className="mt-1 block text-sm">
                  {formatLongDate(appointment.appointment_date)}
                </strong>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-[#f8faf9] p-3.5">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-[#4e9583]" />
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa7a2]">
                  Hora
                </span>
                <strong className="mt-1 block text-sm">
                  {formatTime(appointment.start_time)} · {appointment.duration_minutes} min
                </strong>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-[#f8faf9] p-3.5">
              <Stethoscope className="mt-0.5 size-4 shrink-0 text-[#4e9583]" />
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa7a2]">
                  Profesional
                </span>
                <strong className="mt-1 block text-sm">{appointment.professional_name}</strong>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-[#f8faf9] p-3.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-[#4e9583]" />
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa7a2]">
                  Motivo
                </span>
                <strong className="mt-1 block text-sm">{appointment.reason}</strong>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-[#f8faf9] p-3.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#4e9583]" />
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9aa7a2]">
                  Consultorio
                </span>
                <strong className="mt-1 block text-sm">{appointment.practice_name}</strong>
              </div>
            </div>
          </div>

          {!inactive && (
            <div className="mt-7 grid gap-2.5">
              <a
                className="button button-primary justify-center"
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarDays />
                Agregar a Google Calendar
              </a>
              <a
                className="button button-secondary justify-center"
                href={icsUrl}
                download={`turno-${appointment.appointment_date}.ics`}
              >
                <Download />
                Descargar para Apple / Outlook
              </a>
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 border-t border-[#edf1ee] pt-4 text-[10px] text-[#9aa7a2]">
            <User className="size-3.5" />
            <span>
              Enlace personal de {appointment.patient_first_name}. No lo compartas con otras
              personas.
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}
