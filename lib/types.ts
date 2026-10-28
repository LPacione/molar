export type Profile = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export type Practice = {
  id: string
  owner_id: string
  name: string
  phone: string | null
  created_at: string
  updated_at: string
}

export type PracticeSettings = {
  practice_id: string
  default_duration_minutes: number
  workday_start: string
  workday_end: string
  cancellation_policy: string
}

export type Patient = {
  id: string
  practice_id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  birth_date: string | null
  allergies: string | null
  medical_history: string | null
  created_at: string
  updated_at: string
}

export type AppointmentStatus =
  | 'confirmado'
  | 'pendiente'
  | 'en_atencion'
  | 'atendido'
  | 'cancelado'
  | 'no_asistio'

export type Appointment = {
  id: string
  practice_id: string
  patient_id: string
  appointment_date: string
  start_time: string
  duration_minutes: number
  reason: string
  status: AppointmentStatus
  notes: string | null
  public_token: string
  created_at: string
  updated_at: string
}

export type Consultation = {
  id: string
  practice_id: string
  patient_id: string
  appointment_id: string | null
  consultation_date: string
  reason: string
  procedure: string | null
  next_step: string | null
  notes: string | null
  diagnosis: string | null
  created_at: string
}

export type ToothStatus = 'sano' | 'hallazgo' | 'tratado'

export type OdontogramFinding = {
  id: string
  practice_id: string
  patient_id: string
  tooth_number: number
  status: ToothStatus
  condition: string | null
  notes: string | null
  event_date: string
  updated_at: string
}

export type ToothEvent = {
  id: string
  practice_id: string
  patient_id: string
  tooth_number: number
  appointment_id: string | null
  consultation_id: string | null
  event_date: string
  status: ToothStatus
  condition: string | null
  notes: string | null
  created_at: string
}

export type TreatmentStatus = 'pendiente' | 'en_curso' | 'completado'

export type TreatmentPlan = {
  id: string
  practice_id: string
  patient_id: string
  name: string
  status: TreatmentStatus
  progress: number
  next_step: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DocumentRow = {
  id: string
  practice_id: string
  patient_id: string
  name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number
  created_at: string
}

export type DocumentWithUrl = DocumentRow & {
  signed_url: string | null
}

export type ScheduleBlock = {
  id: string
  practice_id: string
  block_date: string
  start_time: string
  end_time: string
  reason: string | null
  created_at: string
}

export type WorkspaceData = {
  userId: string
  profile: Profile
  practice: Practice
  settings: PracticeSettings
  patients: Patient[]
  appointments: Appointment[]
  consultations: Consultation[]
  findings: OdontogramFinding[]
  toothEvents: ToothEvent[]
  treatmentPlans: TreatmentPlan[]
  documents: DocumentWithUrl[]
  scheduleBlocks: ScheduleBlock[]
  today: string
}

export type PatientInput = {
  first_name: string
  last_name: string
  phone: string
  email?: string
  birth_date?: string
  allergies?: string
  medical_history?: string
}

export type AppointmentInput = {
  patient_id: string
  appointment_date: string
  start_time: string
  duration_minutes: number
  reason: string
  status: AppointmentStatus
  notes?: string
}

export type EvolutionToothInput = {
  tooth_number: number
  status: ToothStatus
  condition?: string
  notes?: string
}

export type ConsultationInput = {
  patient_id: string
  appointment_id?: string
  consultation_date: string
  reason: string
  procedure?: string
  next_step?: string
  notes?: string
  diagnosis?: string
  tooth_numbers?: number[]
  tooth_events?: EvolutionToothInput[]
}

export type ToothFindingInput = {
  patient_id: string
  tooth_number: number
  status: ToothStatus
  condition?: string
  notes?: string
}

export type TreatmentPlanInput = {
  patient_id: string
  name: string
  status: TreatmentStatus
  progress: number
  next_step?: string
  notes?: string
}

export type SettingsInput = {
  full_name: string
  practice_name: string
  phone?: string
  default_duration_minutes: number
  workday_start: string
  workday_end: string
  cancellation_policy?: string
}

export type ActionResult =
  | { ok: true; appointment?: Appointment }
  | { ok: false; error: string }

export type WorkspaceResult =
  | { status: 'unconfigured' }
  | { status: 'unauthenticated' }
  | { status: 'incomplete'; message: string }
  | { status: 'ok'; data: WorkspaceData }
