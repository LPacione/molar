import type { Appointment, PracticeSettings, ScheduleBlock } from '@/lib/types'

const SLOT_STEP_MINUTES = 15

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes: number) {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.round(totalMinutes)))
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(
    normalized % 60,
  ).padStart(2, '0')}`
}

export function addMinutesToTime(value: string, minutes: number) {
  return minutesToTime(timeToMinutes(value) + minutes)
}

function intervalsOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
) {
  return firstStart < secondEnd && secondStart < firstEnd
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

type SlotInput = {
  date: string
  duration: number
  settings: Pick<PracticeSettings, 'workday_start' | 'workday_end'>
  appointments: Pick<
    Appointment,
    'appointment_date' | 'start_time' | 'duration_minutes' | 'status'
  >[]
  scheduleBlocks: Pick<ScheduleBlock, 'block_date' | 'start_time' | 'end_time'>[]
  now?: Date
}

export function getAvailableSlots({
  date,
  duration,
  settings,
  appointments,
  scheduleBlocks,
  now = new Date(),
}: SlotInput) {
  const workdayStart = timeToMinutes(settings.workday_start)
  const workdayEnd = timeToMinutes(settings.workday_end)
  const currentDate = localDateKey(now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (!date || date < currentDate || !Number.isFinite(duration) || duration <= 0) return []

  const dayAppointments = appointments.filter(
    (appointment) =>
      appointment.appointment_date === date && appointment.status !== 'cancelado',
  )
  const dayBlocks = scheduleBlocks.filter((block) => block.block_date === date)
  const slots: string[] = []

  for (
    let start = workdayStart;
    start + duration <= workdayEnd;
    start += SLOT_STEP_MINUTES
  ) {
    if (date === currentDate && start <= currentMinutes) continue

    const end = start + duration
    const appointmentConflict = dayAppointments.some((appointment) => {
      const appointmentStart = timeToMinutes(appointment.start_time)
      return intervalsOverlap(
        start,
        end,
        appointmentStart,
        appointmentStart + appointment.duration_minutes,
      )
    })
    if (appointmentConflict) continue

    const blockConflict = dayBlocks.some((block) =>
      intervalsOverlap(
        start,
        end,
        timeToMinutes(block.start_time),
        timeToMinutes(block.end_time),
      ),
    )
    if (blockConflict) continue

    slots.push(minutesToTime(start))
  }

  return slots
}
