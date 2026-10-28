const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const TONES = [
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-cyan-100 text-cyan-700',
  'bg-pink-100 text-pink-700',
]

export function splitIsoDate(value: string | null | undefined) {
  if (!value) return null
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

export function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function todayIso() {
  const now = new Date()
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function addDaysIso(value: string, days: number) {
  const parts = splitIsoDate(value)
  if (!parts) return value
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function formatDate(value: string | null | undefined) {
  const parts = splitIsoDate(value)
  if (!parts) return '—'
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`
}

export function formatLongDate(value: string | null | undefined) {
  const parts = splitIsoDate(value)
  if (!parts) return '—'
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()]
  return `${weekday} ${parts.day} de ${MONTHS_LONG[parts.month - 1]} de ${parts.year}`
}

export function formatShortDate(value: string | null | undefined) {
  const parts = splitIsoDate(value)
  if (!parts) return '—'
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '—'
  return value.slice(0, 5)
}

export function formatMonthYear(value: string | null | undefined) {
  const parts = splitIsoDate(value)
  if (!parts) return '—'
  return `${MONTHS_LONG[parts.month - 1]} ${parts.year}`
}

export function fullName(patient: { first_name: string; last_name: string }) {
  return `${patient.first_name} ${patient.last_name}`.trim()
}

export function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

export function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

export function avatarTone(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return TONES[hash % TONES.length]
}

export function ageFromBirthDate(value: string | null | undefined) {
  const parts = splitIsoDate(value)
  if (!parts) return null
  const today = new Date()
  let age = today.getFullYear() - parts.year
  const beforeBirthday =
    today.getMonth() + 1 < parts.month ||
    (today.getMonth() + 1 === parts.month && today.getDate() < parts.day)
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : null
}

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente de confirmar',
  en_atencion: 'En atención',
  atendido: 'Atendido',
  cancelado: 'Cancelado',
  no_asistio: 'No asistió',
}

export const APPOINTMENT_STATUS_CLASS: Record<string, string> = {
  confirmado: 'status-confirmed',
  pendiente: 'status-pending',
  en_atencion: 'status-progress',
  atendido: 'status-done',
  cancelado: 'status-cancelled',
  no_asistio: 'status-absent',
}

export const TREATMENT_STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completado: 'Completado',
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function whatsappHref(phone: string | null | undefined, message: string) {
  const number = (phone ?? '').replace(/\D/g, '')
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
