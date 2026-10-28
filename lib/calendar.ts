export type CalendarEventInput = {
  date: string
  startTime: string
  durationMinutes: number
  title: string
  details: string
  location: string
}

function eventInstants(date: string, startTime: string, durationMinutes: number) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = startTime.split(':').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  return { start, end }
}

function floatingDateTime(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('') +
    'T' +
    [
      String(value.getUTCHours()).padStart(2, '0'),
      String(value.getUTCMinutes()).padStart(2, '0'),
      '00',
    ].join('')
}

function stampDateTime(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function publicAppointmentUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/$/, '')}/turno/${token}`
}

export function publicAppointmentIcsUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/$/, '')}/api/turno/${token}/calendar.ics`
}

export function googleCalendarUrl(input: CalendarEventInput) {
  const { start, end } = eventInstants(input.date, input.startTime, input.durationMinutes)
  const query = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(input.title)}`,
    `dates=${floatingDateTime(start)}/${floatingDateTime(end)}`,
    `details=${encodeURIComponent(input.details)}`,
    `location=${encodeURIComponent(input.location)}`,
  ].join('&')
  return `https://calendar.google.com/calendar/render?${query}`
}

export function buildIcs(
  input: CalendarEventInput & { uid: string; status?: string },
) {
  const { start, end } = eventInstants(input.date, input.startTime, input.durationMinutes)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Molar//Turnos//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@molar`,
    `DTSTAMP:${stampDateTime(new Date())}`,
    `DTSTART:${floatingDateTime(start)}`,
    `DTEND:${floatingDateTime(end)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
    `DESCRIPTION:${escapeIcs(input.details)}`,
    `LOCATION:${escapeIcs(input.location)}`,
    `STATUS:${['cancelado', 'no_asistio'].includes(input.status ?? '') ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}
