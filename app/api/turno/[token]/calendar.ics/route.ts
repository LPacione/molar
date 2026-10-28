import { buildIcs } from '@/lib/calendar'
import { getPublicAppointment } from '@/lib/public-appointment'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const appointment = await getPublicAppointment(token)

  if (!appointment) {
    return new Response('Turno no encontrado', { status: 404 })
  }

  const ics = buildIcs({
    uid: token,
    status: appointment.status,
    date: appointment.appointment_date,
    startTime: appointment.start_time,
    durationMinutes: appointment.duration_minutes,
    title: `Turno odontológico en ${appointment.practice_name}`,
    details: [
      `Paciente: ${appointment.patient_first_name}`,
      `Profesional: ${appointment.professional_name}`,
      `Motivo: ${appointment.reason}`,
      `Duración: ${appointment.duration_minutes} minutos`,
    ].join('\n'),
    location: appointment.practice_name,
  })

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="turno-${appointment.appointment_date}.ics"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
