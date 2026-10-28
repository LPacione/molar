'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TrendingUp,
  Upload,
  UserX,
  Users,
  X,
} from 'lucide-react'
import { signOutAction } from '@/app/auth-actions'
import {
  createAppointmentAction,
  createConsultationAction,
  createPatientAction,
  createTreatmentPlanAction,
  deleteDocumentAction,
  saveSettingsAction,
  saveToothFindingAction,
  updateAppointmentStatusAction,
  updatePatientAction,
  uploadDocumentAction,
} from '@/lib/actions/workspace'
import {
  addDaysIso,
  ageFromBirthDate,
  APPOINTMENT_STATUS_CLASS,
  APPOINTMENT_STATUS_LABEL,
  avatarTone,
  formatBytes,
  formatDate,
  formatLongDate,
  formatMonthYear,
  formatTime,
  fullName,
  initials,
  isoDate,
  personInitials,
  splitIsoDate,
  TREATMENT_STATUS_LABEL,
  whatsappHref,
} from '@/lib/format'
import { publicAppointmentUrl } from '@/lib/calendar'
import {
  exportAllPatientsCsv,
  exportAllPatientsPdf,
  exportPatientCsv,
  exportPatientPdf,
} from '@/lib/export'
import { getAvailableSlots } from '@/lib/schedule'
import { getSiteUrl } from '@/lib/supabase/config'
import type {
  ActionResult,
  Appointment,
  AppointmentStatus,
  Consultation,
  DocumentWithUrl,
  OdontogramFinding,
  Patient,
  ScheduleBlock,
  ToothEvent,
  ToothStatus,
  TreatmentPlan,
  WorkspaceData,
} from '@/lib/types'

type Section =
  | 'Inicio'
  | 'Agenda'
  | 'Pacientes'
  | 'Historia clínica'
  | 'Tratamientos'
  | 'Configuración'
type PatientTab = 'resumen' | 'historia' | 'odontograma' | 'tratamiento' | 'documentos'
type ModalType = 'appointment' | 'patient' | 'consultation' | 'treatment' | 'evolution'
type ModalState = { type: ModalType; patientId?: string; appointmentId?: string } | null
type ActionSuccess = Extract<ActionResult, { ok: true }>
type RunAction = (
  task: () => Promise<ActionResult>,
  successMessage: string,
  onDone?: (result: ActionSuccess) => void,
) => void

const TOOTH_STATUSES: ToothStatus[] = ['sano', 'hallazgo', 'tratado']
const TOOTH_STATUS_LABEL: Record<ToothStatus, string> = {
  sano: 'Sano',
  hallazgo: 'Hallazgo',
  tratado: 'Tratado',
}
const PERMANENT_TEETH = Array.from({ length: 32 }, (_, index) =>
  index < 8
    ? 18 - index
    : index < 16
      ? 21 + (index - 8)
      : index < 24
        ? 31 + (index - 16)
        : 48 - (index - 24),
)

type EvolutionToothDraft = {
  status: ToothStatus
  condition: string
  notes: string
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="logo-mark">
        <span />
        <span />
      </div>
      <span className="text-[20px] font-semibold tracking-[-0.04em]">molar</span>
    </div>
  )
}

function ExportMenu({
  label = 'Exportar',
  onCsv,
  onPdf,
  notify,
}: {
  label?: string
  onCsv: () => Promise<void>
  onPdf: () => Promise<void>
  notify: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const runExport = async (kind: 'csv' | 'pdf') => {
    setOpen(false)
    setBusy(kind)
    try {
      await (kind === 'csv' ? onCsv() : onPdf())
    } catch (error) {
      console.error('Error al exportar:', error)
      notify('No se pudo generar la exportación. Intentá nuevamente.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="export-menu" ref={containerRef}>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => setOpen((value) => !value)}
        disabled={Boolean(busy)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download />
        {busy ? 'Exportando…' : label}
      </button>
      {open && (
        <div className="export-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => runExport('csv')}>
            <FileText />
            CSV (.zip)
          </button>
          <button type="button" role="menuitem" onClick={() => runExport('pdf')}>
            <FileText />
            PDF
          </button>
        </div>
      )}
    </div>
  )
}

function Avatar({ patient, size = 'md' }: { patient: Patient; size?: 'sm' | 'md' }) {
  return (
    <div
      className={`${avatarTone(patient.id)} ${
        size === 'sm' ? 'size-8 text-[11px]' : 'size-10 text-xs'
      } flex shrink-0 items-center justify-center rounded-full font-semibold`}
    >
      {initials(patient.first_name, patient.last_name)}
    </div>
  )
}

function StatusBadge({ status }: { status: AppointmentStatus | string }) {
  return (
    <span className={APPOINTMENT_STATUS_CLASS[status] ?? 'status-available'}>
      {APPOINTMENT_STATUS_LABEL[status] ?? status}
    </span>
  )
}

export default function MolarApp({ data }: { data: WorkspaceData }) {
  const router = useRouter()
  const [section, setSection] = useState<Section>('Inicio')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [patientTab, setPatientTab] = useState<PatientTab>('resumen')
  const [modal, setModal] = useState<ModalState>(null)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [agendaDate, setAgendaDate] = useState(data.today)
  const [pending, startTransition] = useTransition()

  const {
    profile,
    practice,
    settings,
    patients,
    appointments,
    consultations,
    findings,
    treatmentPlans,
    documents,
    scheduleBlocks,
    today,
  } = data

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const run: RunAction = (task, successMessage, onDone) => {
    startTransition(async () => {
      const result = await task()
      if (!result.ok) {
        notify(result.error)
        return
      }
      notify(successMessage)
      onDone?.(result)
      router.refresh()
    })
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return patients
      .filter((patient) => {
        const name = fullName(patient).toLowerCase()
        return (
          name.includes(term) ||
          (patient.phone ?? '').toLowerCase().includes(term) ||
          (patient.email ?? '').toLowerCase().includes(term)
        )
      })
      .slice(0, 6)
  }, [patients, query])

  const selected = patients.find((patient) => patient.id === selectedId) ?? null
  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  )
  const appointmentById = useMemo(
    () => new Map(appointments.map((appointment) => [appointment.id, appointment])),
    [appointments],
  )
  const notedAppointmentIds = useMemo(
    () =>
      new Set(
        consultations
          .map((consultation) => consultation.appointment_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [consultations],
  )
  const evolutionAppointment =
    modal?.type === 'evolution' && modal.appointmentId
      ? appointmentById.get(modal.appointmentId) ?? null
      : null
  const evolutionPatient = evolutionAppointment
    ? patientById.get(evolutionAppointment.patient_id) ?? null
    : null

  const openEvolution = (appointmentId: string) => {
    setModal({ type: 'evolution', appointmentId })
  }

  const openPatient = (id: string, tab: PatientTab = 'resumen') => {
    setSelectedId(id)
    setPatientTab(tab)
    setSection('Pacientes')
    setQuery('')
    setMobileNav(false)
  }

  const openModal = (type: ModalType, patientId?: string) => {
    setModal({ type, patientId })
  }

  const navItems = [
    [LayoutDashboard, 'Inicio'],
    [CalendarDays, 'Agenda'],
    [Users, 'Pacientes'],
  ] as const

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#1f2b2a]">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="flex items-center justify-between">
          <Logo />
          <button
            className="icon-button md:hidden"
            onClick={() => setMobileNav(false)}
            aria-label="Cerrar menú"
          >
            <X />
          </button>
        </div>

        <div className="mt-10 flex flex-col gap-1.5">
          {navItems.map(([Icon, label]) => (
            <button
              key={label}
              onClick={() => {
                setSection(label)
                setSelectedId(null)
                setMobileNav(false)
              }}
              className={`nav-item ${section === label ? 'nav-active' : ''}`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          <div className="my-5 border-t border-[#e5eae7]" />
          <p className="sidebar-label">GESTIÓN CLÍNICA</p>
          <button
            onClick={() => {
              setSection('Historia clínica')
              setSelectedId(null)
              setMobileNav(false)
            }}
            className={`nav-item ${section === 'Historia clínica' ? 'nav-active' : ''}`}
          >
            <FileText />
            <span>Historia clínica</span>
          </button>
          <button
            onClick={() => {
              setSection('Tratamientos')
              setSelectedId(null)
              setMobileNav(false)
            }}
            className={`nav-item ${section === 'Tratamientos' ? 'nav-active' : ''}`}
          >
            <HeartPulse />
            <span>Tratamientos</span>
          </button>
          <div className="my-5 border-t border-[#e5eae7]" />
          <button
            onClick={() => {
              setSection('Configuración')
              setSelectedId(null)
              setMobileNav(false)
            }}
            className={`nav-item ${section === 'Configuración' ? 'nav-active' : ''}`}
          >
            <Settings />
            <span>Configuración</span>
          </button>
        </div>

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-[#e4eae6] bg-white/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d8eee8] text-[11px] font-bold text-[#247264]">
                {personInitials(profile.full_name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={profile.full_name}>
                  {profile.full_name}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={practice.name}>
                  {practice.name}
                </p>
              </div>
            </div>
          </div>
          <form action={signOutAction}>
            <button className="nav-item" type="submit">
              <LogOut />
              <span>Cerrar sesión</span>
            </button>
          </form>
          <div className="flex items-center gap-2 px-3 text-[10px] text-[#99a7a1]">
            <ShieldCheck className="size-3.5" />
            <span>Datos privados de tu consultorio</span>
          </div>
        </div>
      </aside>

      {mobileNav && (
        <div
          className="fixed inset-0 z-20 bg-black/20 md:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button md:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Abrir menú"
          >
            <Menu />
          </button>
          <div className="hidden text-sm text-muted-foreground md:block">
            {practice.name} / <span className="text-[#263b38]">{section}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="global-search">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar paciente..."
                aria-label="Buscar paciente"
              />
              {query && (
                <div className="search-results">
                  {filtered.length ? (
                    filtered.map((patient) => (
                      <button key={patient.id} onClick={() => openPatient(patient.id)}>
                        <Avatar patient={patient} size="sm" />
                        <span>{fullName(patient)}</span>
                        <small>{patient.phone || patient.email || 'Sin contacto'}</small>
                      </button>
                    ))
                  ) : (
                    <p>No encontramos pacientes en tu consultorio</p>
                  )}
                </div>
              )}
            </div>
            <div className="hidden size-9 items-center justify-center rounded-full bg-[#d8eee8] text-[11px] font-bold text-[#247264] sm:flex">
              {personInitials(profile.full_name)}
            </div>
          </div>
        </header>

        <div className="page-wrap">
          {section === 'Inicio' && (
            <Dashboard
              data={data}
              onNewAppointment={() => openModal('appointment')}
              onNewPatient={() => openModal('patient')}
              onOpenPatient={openPatient}
              onOpenAgenda={() => setSection('Agenda')}
              onOpenPatients={() => {
                setSelectedId(null)
                setSection('Pacientes')
              }}
              onEvolve={openEvolution}
              notedAppointmentIds={notedAppointmentIds}
              run={run}
              pending={pending}
            />
          )}

          {section === 'Agenda' && (
            <Agenda
              patients={patientById}
              appointments={appointments}
              scheduleBlocks={scheduleBlocks}
              date={agendaDate}
              today={today}
              settings={settings}
              practiceName={practice.name}
               setDate={setAgendaDate}
               onNew={() => openModal('appointment')}
               onOpen={openPatient}
               onEvolve={openEvolution}
               notedAppointmentIds={notedAppointmentIds}
               notify={notify}
               run={run}
               pending={pending}
             />
          )}

          {section === 'Pacientes' && !selected && (
            <Patients
                data={data}
                onNew={() => openModal('patient')}
                onOpen={openPatient}
                onEdit={(id) => openModal('patient', id)}
                notify={notify}
              />
          )}

          {section === 'Pacientes' && selected && (
            <PatientDetail
              key={`${selected.id}:${patientTab}`}
              patient={selected}
              data={data}
              run={run}
              pending={pending}
              initialTab={patientTab}
              close={() => setSelectedId(null)}
              onEdit={() => openModal('patient', selected.id)}
              onNewAppointment={() => openModal('appointment', selected.id)}
               onNewConsultation={() => openModal('consultation', selected.id)}
               onNewTreatment={() => openModal('treatment', selected.id)}
               onEvolve={openEvolution}
               notify={notify}
             />
          )}

          {section === 'Historia clínica' && (
            <ClinicalHistoryPage
                data={data}
                onOpenPatient={(id) => openPatient(id, 'historia')}
                notify={notify}
              />
          )}

          {section === 'Tratamientos' && (
            <TreatmentsPage
              data={data}
              onOpenPatient={(id) => openPatient(id, 'tratamiento')}
            />
          )}

          {section === 'Configuración' && (
            <SettingsPage data={data} run={run} pending={pending} />
          )}
        </div>
      </main>

      {modal?.type === 'appointment' && (
        <AppointmentModal
          patients={patients}
          appointments={appointments}
          scheduleBlocks={scheduleBlocks}
          settings={settings}
          today={today}
          practiceName={practice.name}
          defaultPatientId={modal.patientId}
          close={() => setModal(null)}
          run={run}
          pending={pending}
        />
      )}
      {modal?.type === 'patient' && (
        <PatientModal
          patient={modal.patientId ? patientById.get(modal.patientId) : undefined}
          close={() => setModal(null)}
          run={run}
          pending={pending}
        />
      )}
      {modal?.type === 'consultation' && modal.patientId && (
        <ConsultationModal
          patient={patientById.get(modal.patientId)}
          today={today}
          close={() => setModal(null)}
          run={run}
          pending={pending}
        />
      )}
      {modal?.type === 'treatment' && modal.patientId && (
        <TreatmentModal
          patient={patientById.get(modal.patientId)}
          close={() => setModal(null)}
          run={run}
          pending={pending}
        />
      )}
      {modal?.type === 'evolution' && evolutionAppointment && evolutionPatient && (
        <EvolutionWorkspace
          appointment={evolutionAppointment}
          patient={evolutionPatient}
          data={data}
          close={() => setModal(null)}
          run={run}
          pending={pending}
        />
      )}

      {toast && (
        <div className="toast">
          <Check className="size-4" />
          {toast}
        </div>
      )}
    </div>
  )
}

function Dashboard({
  data,
  onNewAppointment,
  onNewPatient,
  onOpenPatient,
  onOpenAgenda,
  onOpenPatients,
  onEvolve,
  notedAppointmentIds,
  run,
  pending,
}: {
  data: WorkspaceData
  onNewAppointment: () => void
  onNewPatient: () => void
  onOpenPatient: (id: string) => void
  onOpenAgenda: () => void
  onOpenPatients: () => void
  onEvolve: (appointmentId: string) => void
  notedAppointmentIds: Set<string>
  run: RunAction
  pending: boolean
}) {
  const { profile, patients, appointments, consultations, treatmentPlans, today } = data
  const patientById = new Map(patients.map((patient) => [patient.id, patient]))
  const todayAppointments = appointments
    .filter((appointment) => appointment.appointment_date === today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  const attended = todayAppointments.filter((appointment) => appointment.status === 'atendido')
  const pendingAppointments = todayAppointments.filter(
    (appointment) => appointment.status === 'pendiente',
  )
  const nextAppointment = todayAppointments.find(
    (appointment) =>
      !['atendido', 'cancelado', 'no_asistio'].includes(appointment.status),
  )
  const activePlans = treatmentPlans.filter((plan) => plan.status !== 'completado').slice(0, 3)
  const recentConsultations = consultations.slice(0, 3)
  const nextPatient = nextAppointment ? patientById.get(nextAppointment.patient_id) : null
  const nowTime = new Date().toTimeString().slice(0, 5)
  const noShowsToday = todayAppointments.filter(
    (appointment) => appointment.status === 'no_asistio',
  ).length
  const monthAppointments = appointments.filter((appointment) =>
    appointment.appointment_date.startsWith(today.slice(0, 7)),
  )
  const noShowsMonth = monthAppointments.filter(
    (appointment) => appointment.status === 'no_asistio',
  ).length
  const attendedMonth = monthAppointments.filter(
    (appointment) => appointment.status === 'atendido',
  ).length
  const noShowRate = noShowsMonth + attendedMonth
    ? Math.round((noShowsMonth / (noShowsMonth + attendedMonth)) * 100)
    : 0
  const riskWindowStart = addDaysIso(today, -182)
  const noShowCounts = new Map<string, number>()
  for (const appointment of appointments) {
    if (
      appointment.status === 'no_asistio' &&
      appointment.appointment_date >= riskWindowStart
    ) {
      noShowCounts.set(
        appointment.patient_id,
        (noShowCounts.get(appointment.patient_id) ?? 0) + 1,
      )
    }
  }
  const patientsAtRisk = Array.from(noShowCounts.entries()).filter(
    ([patientId, count]) => count >= 2 && patientById.has(patientId),
  ).length
  const pendingEvolutions = appointments
    .filter(
      (appointment) =>
        !['cancelado', 'no_asistio'].includes(appointment.status) &&
        !notedAppointmentIds.has(appointment.id) &&
        (appointment.appointment_date < today ||
          (appointment.appointment_date === today &&
            appointment.start_time.slice(0, 5) <= nowTime)),
    )
    .sort(
      (a, b) =>
        b.appointment_date.localeCompare(a.appointment_date) ||
        b.start_time.localeCompare(a.start_time),
    )

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{formatLongDate(today).toUpperCase()}</p>
          <h1>Buen día, {profile.full_name}</h1>
          <p className="subheading">Todo listo para una nueva jornada.</p>
        </div>
        <div className="header-actions">
          <button className="button button-secondary" onClick={onNewPatient}>
            <Plus />
            Nuevo paciente
          </button>
          <button className="button button-primary" onClick={onNewAppointment}>
            <CalendarDays />
            Nuevo turno
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <Stat
          icon={CalendarDays}
          label="Turnos de hoy"
          value={String(todayAppointments.length)}
          detail={`${attended.length} atendidos${noShowsToday ? ` · ${noShowsToday} ausencias` : ''}`}
          tone="teal"
        />
        <Stat
          icon={Activity}
          label="Pacientes atendidos"
          value={String(attended.length)}
          detail="en la jornada"
          tone="blue"
        />
        <Stat
          icon={Clock3}
          label="Próximo turno"
          value={nextAppointment ? formatTime(nextAppointment.start_time) : '—'}
          detail={nextPatient ? fullName(nextPatient) : 'Sin turnos pendientes'}
          tone="amber"
        />
        <Stat
          icon={AlertCircle}
          label="Por confirmar"
          value={String(pendingAppointments.length)}
          detail={pendingAppointments.length ? 'Requiere atención' : 'Agenda al día'}
          tone="rose"
        />
      </div>

      <div className="content-grid">
        <section className="panel appointments-panel">
          <div className="panel-header">
            <div>
              <h2>Agenda de hoy</h2>
              <p className="panel-subtitle">Tus próximos turnos, en orden</p>
            </div>
            <button className="text-button" onClick={onOpenAgenda}>
              Ver agenda <ChevronRight />
            </button>
          </div>
          <div className="appointment-list">
            {todayAppointments.length ? (
              todayAppointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  patient={patientById.get(appointment.patient_id)}
                  practiceName={data.practice.name}
                  cancellationPolicy={data.settings.cancellation_policy}
                  isFirstAppointment={
                    appointments.filter(
                      (item) => item.patient_id === appointment.patient_id,
                    ).length === 1
                  }
                  onOpen={onOpenPatient}
                  onEvolve={onEvolve}
                  onNoShow={(item) =>
                    markNoShow(item, patientById.get(item.patient_id), run)
                  }
                  noShowEligible={canMarkNoShow(appointment, today, nowTime)}
                  hasNote={notedAppointmentIds.has(appointment.id)}
                  pending={pending}
                />
              ))
            ) : (
              <InlineEmpty
                icon={<CalendarDays />}
                title="Tu agenda de hoy está vacía"
                detail="Creá el primer turno de este consultorio."
                action="Nuevo turno"
                onAction={onNewAppointment}
              />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Próximas acciones</h2>
              <p className="panel-subtitle">Un vistazo a lo que sigue</p>
            </div>
            <CircleDotIcon />
          </div>
          <div className="action-list">
            <div className="action-card">
              <div className="action-icon bg-[#e7f4ef] text-[#398676]">
                <MessageCircle />
              </div>
              <div>
                <p className="font-medium">Confirmar turnos</p>
                <p className="text-xs text-muted-foreground">
                  {pendingAppointments.length
                    ? `${pendingAppointments.length} turno(s) pendiente(s)`
                    : 'No hay turnos por confirmar'}
                </p>
              </div>
              <button
                disabled={pending || !pendingAppointments.length}
                onClick={() => {
                  const target = pendingAppointments[0]
                  if (!target) return
                  run(
                    () => updateAppointmentStatusAction(target.id, 'confirmado'),
                    'Turno marcado como confirmado',
                  )
                }}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-[#318171] hover:bg-[#edf7f3] disabled:opacity-40"
              >
                Resolver
              </button>
            </div>
            <div className="action-card">
              <div className="action-icon bg-[#fff3da] text-[#b8862d]">
                <HeartPulse />
              </div>
              <div>
                <p className="font-medium">Seguimiento clínico</p>
                <p className="text-xs text-muted-foreground">
                  {activePlans.length} tratamiento(s) activo(s)
                </p>
              </div>
              <button onClick={onOpenPatients} className="ml-auto text-muted-foreground">
                <ChevronRight />
              </button>
            </div>
            <div className="action-card">
              <div className="action-icon bg-[#e8f0f8] text-[#5482a4]">
                <Stethoscope />
              </div>
              <div>
                <p className="font-medium">Evoluciones pendientes</p>
                <p className="text-xs text-muted-foreground">
                  {pendingEvolutions.length
                    ? `${pendingEvolutions.length} turno(s) sin evolución`
                    : 'Todos los turnos están registrados'}
                </p>
              </div>
              <button
                disabled={pending || !pendingEvolutions.length}
                onClick={() => {
                  const target = pendingEvolutions[0]
                  if (target) onEvolve(target.id)
                }}
                className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-[#318171] hover:bg-[#edf7f3] disabled:opacity-40"
              >
                Registrar
              </button>
            </div>
            <div className="action-card">
              <div className="action-icon bg-[#e8f0f8] text-[#5482a4]">
                <Bell />
              </div>
              <div>
                <p className="font-medium">Pacientes registrados</p>
                <p className="text-xs text-muted-foreground">
                  {patients.length} ficha(s) en tu consultorio
                </p>
              </div>
              <button onClick={onOpenPatients} className="ml-auto text-muted-foreground">
                <ChevronRight />
              </button>
            </div>
          </div>
          <div className="soft-note">
            <Stethoscope />
            <span>
              La información de este panel pertenece exclusivamente a {data.practice.name}.
            </span>
          </div>
        </section>
      </div>

      <div className="dashboard-lower-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Seguimientos pendientes</h2>
              <p className="panel-subtitle">Tratamientos que todavía requieren atención</p>
            </div>
            <ClipboardList className="size-5 text-[#99aaa4]" />
          </div>
          <div className="follow-up-list">
            {activePlans.length ? (
              activePlans.map((plan) => {
                const patient = patientById.get(plan.patient_id)
                return (
                  <div className="follow-up-row" key={plan.id}>
                    <div className={`follow-up-dot dot-${planTone(plan.status)}`} />
                    <div>
                      <strong>{plan.name}</strong>
                      <p>
                        {patient ? fullName(patient) : 'Paciente'} ·{' '}
                        {plan.next_step || 'Sin próximo paso definido'}
                      </p>
                    </div>
                    <span className="ml-auto text-[10px] font-semibold text-[#4e9583]">
                      {plan.progress}%
                    </span>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                No hay tratamientos activos en este consultorio.
              </p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Últimas consultas</h2>
              <p className="panel-subtitle">Historia clínica reciente</p>
            </div>
            <FileText className="size-5 text-[#99aaa4]" />
          </div>
          <div className="follow-up-list">
            {recentConsultations.length ? (
              recentConsultations.map((consultation) => {
                const patient = patientById.get(consultation.patient_id)
                return (
                  <div className="follow-up-row" key={consultation.id}>
                    <div className="follow-up-dot dot-teal" />
                    <div>
                      <strong>{patient ? fullName(patient) : 'Paciente'}</strong>
                      <p>
                        {formatDate(consultation.consultation_date)} ·{' '}
                        {consultation.procedure || consultation.reason}
                      </p>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no registraste consultas.</p>
            )}
          </div>
        </section>
      </div>

      <section className="panel metrics-panel">
        <div className="panel-header">
          <div>
            <h2>Resumen del consultorio</h2>
            <p className="panel-subtitle">Datos reales de tu espacio privado</p>
          </div>
          <TrendingUp className="size-5 text-[#398676]" />
        </div>
        <div className="metrics-row">
          <Metric label="Pacientes" value={String(patients.length)} detail="Fichas activas" />
          <Metric
            label="Turnos registrados"
            value={String(appointments.length)}
            detail="En tu agenda"
          />
          <Metric
            label="Consultas"
            value={String(consultations.length)}
            detail="Historia clínica"
          />
          <Metric
            label="Planes activos"
            value={String(treatmentPlans.filter((plan) => plan.status !== 'completado').length)}
            detail="En seguimiento"
          />
          <Metric
            label="Ausencias del mes"
            value={String(noShowsMonth)}
            detail={`${noShowRate}% de ausentismo`}
          />
          <Metric
            label="Pacientes en riesgo"
            value={String(patientsAtRisk)}
            detail="2+ ausencias en 6 meses"
          />
        </div>
      </section>
    </>
  )
}

function CircleDotIcon() {
  return <div className="stat-icon stat-teal size-9"><Activity /></div>
}

function planTone(status: string) {
  if (status === 'completado') return 'teal'
  if (status === 'en_curso') return 'blue'
  return 'amber'
}

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon stat-${tone}`}>
        <Icon />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="stat-value mt-1 text-[27px] font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-item">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>
        <TrendingUp />
        {detail}
      </span>
    </div>
  )
}

function AppointmentRow({
  appointment,
  patient,
  practiceName,
  cancellationPolicy,
  isFirstAppointment,
  onOpen,
  onEvolve,
  onNoShow,
  noShowEligible,
  hasNote,
  pending,
}: {
  appointment: Appointment
  patient?: Patient
  practiceName: string
  cancellationPolicy?: string | null
  isFirstAppointment?: boolean
  onOpen: (id: string) => void
  onEvolve?: (appointmentId: string) => void
  onNoShow?: (appointment: Appointment) => void
  noShowEligible?: boolean
  hasNote?: boolean
  pending?: boolean
}) {
  const whatsapp = appointmentWhatsAppHref(patient, appointment, practiceName, {
    cancellationPolicy,
    isFirstAppointment,
  })
  const canRegisterEvolution =
    Boolean(onEvolve) &&
    !hasNote &&
    !['cancelado', 'no_asistio'].includes(appointment.status)
  return (
    <div className="appointment-row">
      <div className="time-col">
        <strong>{formatTime(appointment.start_time)}</strong>
        <span>{appointment.duration_minutes} min</span>
      </div>
      <div className="patient-mini">
        {patient ? (
          <div
            className={`${avatarTone(patient.id)} flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold`}
          >
            {initials(patient.first_name, patient.last_name)}
          </div>
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#eef2ef] text-xs font-semibold text-[#74817d]">
            ?
          </div>
        )}
        <div>
          <button className="patient-name" onClick={() => patient && onOpen(patient.id)}>
            {patient ? fullName(patient) : 'Paciente eliminado'}
          </button>
          <p>{appointment.reason}</p>
        </div>
      </div>
      {canRegisterEvolution && (
        <button
          className="icon-button text-[#527f9f]"
          onClick={() => onEvolve?.(appointment.id)}
          aria-label="Registrar evolución del turno"
          title="Registrar evolución"
        >
          <Stethoscope />
        </button>
      )}
      {noShowEligible && onNoShow && (
        <button
          className="icon-button text-[#a36a3f]"
          onClick={() => onNoShow(appointment)}
          disabled={pending}
          aria-label="Marcar turno como no asistido"
          title="No asistió"
        >
          <UserX />
        </button>
      )}
      {whatsapp && (
        <a
          className="icon-button text-[#2f8b71]"
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          aria-label="Enviar WhatsApp del turno"
          title="Enviar WhatsApp"
        >
          <MessageCircle />
        </a>
      )}
      <div className="row-status">
        <StatusBadge status={appointment.status} />
      </div>
    </div>
  )
}

function InlineEmpty({
  icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="inline-empty">
      <div className="inline-empty-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      {action && onAction && (
        <button className="button button-secondary button-small ml-auto" onClick={onAction}>
          <Plus />
          {action}
        </button>
      )}
    </div>
  )
}

function canMarkNoShow(appointment: Appointment, today: string, nowTime: string) {
  if (
    ['atendido', 'cancelado', 'no_asistio', 'en_atencion'].includes(
      appointment.status,
    )
  ) {
    return false
  }
  if (appointment.appointment_date < today) return true
  return (
    appointment.appointment_date === today &&
    appointment.start_time.slice(0, 5) <= nowTime
  )
}

function markNoShow(
  appointment: Appointment,
  patient: Patient | undefined,
  run: RunAction,
) {
  const name = patient ? fullName(patient) : 'este paciente'
  if (
    !window.confirm(
      `¿Marcar el turno de ${name} como no asistido? No se pedirá evolución clínica.`,
    )
  ) {
    return
  }
  run(
    () => updateAppointmentStatusAction(appointment.id, 'no_asistio'),
    'Turno marcado como no asistido',
  )
}

function appointmentWhatsAppHref(
  patient: Patient | undefined,
  appointment: Pick<Appointment, 'appointment_date' | 'start_time' | 'reason'> & {
    public_token?: string | null
    status?: AppointmentStatus
  },
  practiceName: string,
  options?: {
    cancellationPolicy?: string | null
    isFirstAppointment?: boolean
  },
) {
  if (!patient?.phone) return null
  const siteUrl = getSiteUrl(
    typeof window === 'undefined' ? undefined : window.location.origin,
  )
  const activeAppointment = !['cancelado', 'no_asistio'].includes(
    appointment.status ?? '',
  )
  const calendarUrl =
    appointment.public_token && activeAppointment
      ? publicAppointmentUrl(siteUrl, appointment.public_token)
      : null
  const policy =
    activeAppointment && options?.isFirstAppointment
      ? options.cancellationPolicy?.trim()
      : ''
  const message = `Hola ${patient.first_name}, te agendamos un turno en ${practiceName} para el ${formatLongDate(
    appointment.appointment_date,
  )} a las ${formatTime(appointment.start_time)}. Motivo: ${appointment.reason}.${
    policy ? `\n\nPolítica de cancelación: ${policy}` : ''
  }${calendarUrl ? `\n\nAgregá el turno a tu calendario: ${calendarUrl}` : ''}`
  return whatsappHref(patient.phone, message)
}

const MONTH_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function buildMonthCells(value: string, today: string) {
  const parts = splitIsoDate(value)
  if (!parts) return []
  const firstDay = new Date(Date.UTC(parts.year, parts.month - 1, 1))
  const offset = (firstDay.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - offset + 1
    const cellDate = new Date(Date.UTC(parts.year, parts.month - 1, day))
    const key = isoDate(cellDate.getUTCFullYear(), cellDate.getUTCMonth() + 1, cellDate.getUTCDate())
    return {
      key,
      day: cellDate.getUTCDate(),
      inMonth: day >= 1 && day <= daysInMonth,
      isToday: key === today,
    }
  })
}

function Agenda({
  patients,
  appointments,
  scheduleBlocks,
  date,
  today,
  settings,
  practiceName,
  setDate,
  onNew,
  onOpen,
  onEvolve,
  notedAppointmentIds,
  notify,
  run,
  pending,
}: {
  patients: Map<string, Patient>
  appointments: Appointment[]
  scheduleBlocks: ScheduleBlock[]
  date: string
  today: string
  settings: WorkspaceData['settings']
  practiceName: string
  setDate: (date: string) => void
  onNew: () => void
  onOpen: (id: string) => void
  onEvolve: (appointmentId: string) => void
  notedAppointmentIds: Set<string>
  notify: (message: string) => void
  run: RunAction
  pending: boolean
}) {
  const [view, setView] = useState<'day' | 'month'>('day')
  const dayAppointments = appointments.filter(
    (appointment) => appointment.appointment_date === date,
  )
  const dayBlocks = scheduleBlocks.filter((block) => block.block_date === date)
  const startHour = Number(settings.workday_start.slice(0, 2))
  const endHour = Number(settings.workday_end.slice(0, 2))
  const hours = Array.from(
    { length: Math.max(1, endHour - startHour + 1) },
    (_, index) => startHour + index,
  )
  const monthCells = buildMonthCells(date, today)
  const monthAppointments = appointments.filter((appointment) =>
    appointment.appointment_date.startsWith(date.slice(0, 7)),
  )
  const nowTime = new Date().toTimeString().slice(0, 5)

  const moveDate = (direction: number) => {
    if (view === 'day') {
      setDate(addDaysIso(date, direction))
      return
    }
    const parts = splitIsoDate(date)
    if (!parts) return
    const next = new Date(Date.UTC(parts.year, parts.month - 1 + direction, 1))
    setDate(isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1))
  }

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">AGENDA</p>
          <h1>Turnos</h1>
          <p className="subheading">Organizá tu día o visualizá el mes completo.</p>
        </div>
        <button className="button button-primary" onClick={onNew}>
          <Plus />
          Nuevo turno
        </button>
      </div>
      <div className="calendar-toolbar">
        <button
          className="button button-secondary button-small"
          onClick={() => moveDate(-1)}
          aria-label={view === 'day' ? 'Día anterior' : 'Mes anterior'}
        >
          <ChevronLeft />
        </button>
        <button
          className="button button-secondary button-small"
          onClick={() => moveDate(1)}
          aria-label={view === 'day' ? 'Día siguiente' : 'Mes siguiente'}
        >
          <ChevronRight />
        </button>
        <button className="button button-secondary button-small" onClick={() => setDate(today)}>
          Hoy
        </button>
        <h2>{view === 'day' ? formatLongDate(date) : formatMonthYear(date)}</h2>
        <div className="view-switch">
          <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>
            Día
          </button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>
            Mes
          </button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="panel month-panel">
          <div className="month-weekdays">
            {MONTH_WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="month-grid">
            {monthCells.map((cell) => {
              const cellAppointments = monthAppointments
                .filter((appointment) => appointment.appointment_date === cell.key)
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
              return (
                <button
                  key={cell.key}
                  type="button"
                  className={`month-cell ${cell.inMonth ? '' : 'month-cell-muted'} ${
                    cell.isToday ? 'month-cell-today' : ''
                  }`}
                  onClick={() => {
                    setDate(cell.key)
                    setView('day')
                  }}
                >
                  <span className="month-day-number">{cell.day}</span>
                  <span className="month-cell-events">
                    {cellAppointments.slice(0, 3).map((appointment) => {
                      const patient = patients.get(appointment.patient_id)
                      return (
                        <span
                          key={appointment.id}
                          className={`month-event month-event-${appointment.status}`}
                        >
                          {formatTime(appointment.start_time)}{' '}
                          {patient ? fullName(patient) : 'Paciente'}
                        </span>
                      )
                    })}
                    {cellAppointments.length > 3 && (
                      <span className="month-more">+{cellAppointments.length - 3} más</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="panel agenda-full">
          {!dayAppointments.length && !dayBlocks.length && (
            <div className="agenda-empty">
              <CalendarDays />
              <div>
                <strong>No hay turnos para este día</strong>
                <p>Podés crear uno nuevo o navegar a otra fecha.</p>
              </div>
              <button className="button button-primary button-small" onClick={onNew}>
                <Plus />
                Nuevo turno
              </button>
            </div>
          )}
          <div className="agenda-hours">
            {hours.map((hour) => {
              const label = `${String(hour).padStart(2, '0')}:00`
              const hourAppointments = dayAppointments.filter(
                (appointment) => Number(appointment.start_time.slice(0, 2)) === hour,
              )
              const hourBlocks = dayBlocks.filter(
                (block) => Number(block.start_time.slice(0, 2)) === hour,
              )
              return (
                <div key={label} className="hour-row">
                  <span>{label}</span>
                  <div>
                    {hourAppointments.map((appointment) => {
                      const patient = patients.get(appointment.patient_id)
                      const eventClass =
                        appointment.status === 'en_atencion'
                          ? 'event-blue'
                          : appointment.status === 'pendiente'
                            ? 'event-rose'
                            : appointment.status === 'no_asistio'
                              ? 'event-absent'
                              : 'event-teal'
                      const whatsapp = appointmentWhatsAppHref(
                        patient,
                        appointment,
                        practiceName,
                        {
                          cancellationPolicy: settings.cancellation_policy,
                          isFirstAppointment:
                            appointments.filter(
                              (item) => item.patient_id === appointment.patient_id,
                            ).length === 1,
                        },
                      )
                      return (
                        <div key={appointment.id} className={`calendar-event ${eventClass}`}>
                          <button
                            type="button"
                            className="calendar-event-main"
                            onClick={() => patient && onOpen(patient.id)}
                          >
                            <b>{patient ? fullName(patient) : 'Paciente'}</b>
                            <small>
                              {formatTime(appointment.start_time)} · {appointment.reason} ·{' '}
                              {appointment.duration_minutes} min
                            </small>
                          </button>
                          {!notedAppointmentIds.has(appointment.id) &&
                            !['cancelado', 'no_asistio'].includes(appointment.status) &&
                            appointment.appointment_date <= today && (
                              <button
                                className="calendar-event-whatsapp"
                                style={{ color: '#527f9f' }}
                                onClick={() => onEvolve(appointment.id)}
                                aria-label="Registrar evolución del turno"
                                title="Registrar evolución"
                              >
                                <Stethoscope />
                              </button>
                            )}
                          {canMarkNoShow(appointment, today, nowTime) && (
                            <button
                              className="calendar-event-whatsapp"
                              style={{ color: '#a36a3f' }}
                              onClick={() => markNoShow(appointment, patient, run)}
                              disabled={pending}
                              aria-label="Marcar turno como no asistido"
                              title="No asistió"
                            >
                              <UserX />
                            </button>
                          )}
                          {whatsapp && (
                            <a
                              className="calendar-event-whatsapp"
                              href={whatsapp}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="Enviar WhatsApp del turno"
                              title="Enviar WhatsApp"
                            >
                              <MessageCircle />
                            </a>
                          )}
                        </div>
                      )
                    })}
                    {hourBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="calendar-event event-blocked"
                        onClick={() => notify('Horario bloqueado en tu agenda')}
                      >
                        <div className="calendar-event-main">
                          <b>Horario bloqueado</b>
                          <small>
                            {formatTime(block.start_time)}–{formatTime(block.end_time)}
                            {block.reason ? ` · ${block.reason}` : ''}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function Patients({
  data,
  onNew,
  onOpen,
  onEdit,
  notify,
}: {
  data: WorkspaceData
  onNew: () => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  notify: (message: string) => void
}) {
  const { patients, appointments, consultations } = data
  const [filter, setFilter] = useState('')
  const term = filter.trim().toLowerCase()
  const list = patients.filter((patient) => {
    if (!term) return true
    return (
      fullName(patient).toLowerCase().includes(term) ||
      (patient.phone ?? '').toLowerCase().includes(term) ||
      (patient.email ?? '').toLowerCase().includes(term)
    )
  })

  const nextAppointmentFor = (patientId: string) =>
    appointments.find(
      (appointment) =>
        appointment.patient_id === patientId &&
        appointment.appointment_date >= todayKey() &&
        !['atendido', 'cancelado', 'no_asistio'].includes(appointment.status),
    )

  const lastConsultationFor = (patientId: string) =>
    consultations.find((consultation) => consultation.patient_id === patientId)

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">GESTIÓN DE PACIENTES</p>
          <h1>Pacientes</h1>
          <p className="subheading">La información de tu consultorio, siempre a mano.</p>
        </div>
        <div className="header-actions">
          <ExportMenu
            label="Exportar todo"
            onCsv={() => exportAllPatientsCsv(data)}
            onPdf={() => exportAllPatientsPdf(data)}
            notify={notify}
          />
          <button className="button button-primary" onClick={onNew}>
            <Plus />
            Nuevo paciente
          </button>
        </div>
      </div>
      <div className="panel patients-panel">
        <div className="patient-toolbar">
          <div className="local-search">
            <Search />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Buscar por nombre, WhatsApp o email..."
            />
          </div>
          <span className="text-xs text-muted-foreground">{list.length} paciente(s)</span>
        </div>
        {list.length ? (
          <div className="patient-table">
            <div className="patient-table-head">
              <span>Paciente</span>
              <span>Contacto</span>
              <span>Última visita</span>
              <span>Próximo turno</span>
              <span />
            </div>
            {list.map((patient) => {
              const last = lastConsultationFor(patient.id)
              const next = nextAppointmentFor(patient.id)
              return (
                <div className="patient-table-row" key={patient.id}>
                  <button className="patient-cell" onClick={() => onOpen(patient.id)}>
                    <Avatar patient={patient} />
                    <span>
                      <strong>{fullName(patient)}</strong>
                      <small>
                        {patient.allergies
                          ? `Alergia: ${patient.allergies}`
                          : 'Sin alertas registradas'}
                      </small>
                    </span>
                  </button>
                  <span className="contact-cell">
                    {patient.phone ? (
                      patient.phone
                    ) : (
                      <span className="text-[#b05c60]">Falta WhatsApp</span>
                    )}
                  </span>
                  <span className="date-cell">
                    {last ? formatDate(last.consultation_date) : 'Sin consultas'}
                  </span>
                  <span className="next-cell">
                    {next ? (
                      <span className="next-badge">
                        {formatDate(next.appointment_date)} · {formatTime(next.start_time)}
                      </span>
                    ) : (
                      <span className="muted">Sin turno</span>
                    )}
                  </span>
                  <button
                    className="row-more"
                    onClick={() => onEdit(patient.id)}
                    aria-label={`Editar ${fullName(patient)}`}
                    title="Editar paciente"
                  >
                    <Pencil />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="inline-empty">
            <div className="inline-empty-icon">
              <Users />
            </div>
            <div>
              <strong>
                {patients.length ? 'No encontramos coincidencias' : 'Tu consultorio está vacío'}
              </strong>
              <p>
                {patients.length
                  ? 'Probá con otro nombre, WhatsApp o email.'
                  : 'Creá la primera ficha de paciente de este espacio de trabajo.'}
              </p>
            </div>
            {!patients.length && (
              <button className="button button-secondary button-small ml-auto" onClick={onNew}>
                <Plus />
                Nuevo paciente
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function ClinicalHistoryPage({
  data,
  onOpenPatient,
  notify,
}: {
  data: WorkspaceData
  onOpenPatient: (id: string) => void
  notify: (message: string) => void
}) {
  const [query, setQuery] = useState('')
  const patientById = useMemo(
    () => new Map(data.patients.map((patient) => [patient.id, patient])),
    [data.patients],
  )
  const term = query.trim().toLowerCase()
  const consultations = data.consultations.filter((consultation) => {
    if (!term) return true
    const patient = patientById.get(consultation.patient_id)
    return (
      (patient ? fullName(patient).toLowerCase().includes(term) : false) ||
      consultation.reason.toLowerCase().includes(term) ||
      (consultation.procedure ?? '').toLowerCase().includes(term) ||
      (consultation.next_step ?? '').toLowerCase().includes(term) ||
      (consultation.diagnosis ?? '').toLowerCase().includes(term) ||
      (consultation.notes ?? '').toLowerCase().includes(term)
    )
  })

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">HISTORIA CLÍNICA</p>
          <h1>Historia clínica</h1>
          <p className="subheading">
            Todas las consultas del consultorio, ordenadas de la más reciente a la más antigua.
          </p>
        </div>
        <div className="header-actions">
          <ExportMenu
            label="Exportar todo"
            onCsv={() => exportAllPatientsCsv(data)}
            onPdf={() => exportAllPatientsPdf(data)}
            notify={notify}
          />
        </div>
      </div>
      <div className="panel clinical-panel">
        <div className="clinical-toolbar">
          <div className="local-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por paciente, procedimiento o diagnóstico..."
              aria-label="Buscar en historia clínica"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {consultations.length} consulta(s)
          </span>
        </div>
        {consultations.length ? (
          <div className="clinical-list">
            {consultations.map((consultation) => {
              const patient = patientById.get(consultation.patient_id)
              return (
                <button
                  key={consultation.id}
                  type="button"
                  className="clinical-row"
                  onClick={() => patient && onOpenPatient(patient.id)}
                  disabled={!patient}
                >
                  <div className="consultation-date">
                    <b>{consultation.consultation_date.slice(8, 10)}</b>
                    <span>
                      {consultation.consultation_date.slice(5, 7)}/
                      {consultation.consultation_date.slice(0, 4)}
                    </span>
                  </div>
                  <div className="clinical-main">
                    <strong>{patient ? fullName(patient) : 'Paciente eliminado'}</strong>
                    <p>{consultation.procedure || consultation.reason}</p>
                    {consultation.procedure && consultation.reason !== consultation.procedure && (
                      <small>Motivo: {consultation.reason}</small>
                    )}
                    {consultation.diagnosis && (
                      <small>Diagnóstico: {consultation.diagnosis}</small>
                    )}
                    {consultation.notes && <small>{consultation.notes}</small>}
                    {consultation.next_step && (
                      <small>Próximo paso: {consultation.next_step}</small>
                    )}
                    {consultation.appointment_id && (
                      <small className="clinical-linked">Evolución de turno</small>
                    )}
                  </div>
                  <ChevronRight className="clinical-chevron" />
                </button>
              )
            })}
          </div>
        ) : (
          <InlineEmpty
            icon={<FileText />}
            title={data.consultations.length ? 'No encontramos consultas' : 'Historia clínica vacía'}
            detail={
              data.consultations.length
                ? 'Probá con otro paciente, motivo o diagnóstico.'
                : 'Las consultas que registres desde la ficha de cada paciente van a aparecer acá.'
            }
          />
        )}
      </div>
    </>
  )
}

type TreatmentFilter = 'todos' | 'pendiente' | 'en_curso' | 'completado'

function TreatmentsPage({
  data,
  onOpenPatient,
}: {
  data: WorkspaceData
  onOpenPatient: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TreatmentFilter>('todos')
  const patientById = useMemo(
    () => new Map(data.patients.map((patient) => [patient.id, patient])),
    [data.patients],
  )
  const term = query.trim().toLowerCase()
  const treatments = data.treatmentPlans.filter((plan) => {
    if (filter !== 'todos' && plan.status !== filter) return false
    if (!term) return true
    const patient = patientById.get(plan.patient_id)
    return (
      plan.name.toLowerCase().includes(term) ||
      (patient ? fullName(patient).toLowerCase().includes(term) : false) ||
      (plan.next_step ?? '').toLowerCase().includes(term)
    )
  })
  const filters: [TreatmentFilter, string][] = [
    ['todos', 'Todos'],
    ['pendiente', 'Pendientes'],
    ['en_curso', 'En curso'],
    ['completado', 'Realizados'],
  ]
  const completedCount = data.treatmentPlans.filter(
    (plan) => plan.status === 'completado',
  ).length

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">TRATAMIENTOS</p>
          <h1>Tratamientos</h1>
          <p className="subheading">
            Todos los tratamientos del consultorio. {completedCount} realizado(s).
          </p>
        </div>
      </div>
      <div className="panel clinical-panel">
        <div className="clinical-toolbar">
          <div className="local-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por paciente o tratamiento..."
              aria-label="Buscar tratamientos"
            />
          </div>
          <div className="view-switch clinical-filters">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {treatments.length ? (
          <div className="clinical-list">
            {treatments.map((plan) => {
              const patient = patientById.get(plan.patient_id)
              const statusClass =
                plan.status === 'completado'
                  ? 'status-done'
                  : plan.status === 'en_curso'
                    ? 'status-progress'
                    : 'status-pending'
              return (
                <button
                  key={plan.id}
                  type="button"
                  className="clinical-row"
                  onClick={() => patient && onOpenPatient(patient.id)}
                  disabled={!patient}
                >
                  <div className={`treatment-mark treatment-mark-${plan.status}`} />
                  <div className="clinical-main">
                    <strong>{plan.name}</strong>
                    <p>
                      {patient ? fullName(patient) : 'Paciente eliminado'}
                      {plan.next_step ? ` · ${plan.next_step}` : ''}
                    </p>
                    <div className="clinical-progress">
                      <div className="progress-track">
                        <div style={{ width: `${plan.progress}%` }} />
                      </div>
                      <small>
                        {plan.progress}% · {formatDate(plan.created_at)}
                      </small>
                    </div>
                  </div>
                  <span className={statusClass}>{TREATMENT_STATUS_LABEL[plan.status]}</span>
                  <ChevronRight className="clinical-chevron" />
                </button>
              )
            })}
          </div>
        ) : (
          <InlineEmpty
            icon={<HeartPulse />}
            title={
              data.treatmentPlans.length
                ? 'No encontramos tratamientos con ese filtro'
                : 'Todavía no hay tratamientos'
            }
            detail={
              data.treatmentPlans.length
                ? 'Probá con otro paciente, tratamiento o estado.'
                : 'Los tratamientos que agregues desde la ficha de cada paciente van a aparecer acá.'
            }
          />
        )}
      </div>
    </>
  )
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

function PatientDetail({
  patient,
  data,
  run,
  pending,
  initialTab,
  close,
  onEdit,
  onNewAppointment,
  onNewConsultation,
  onNewTreatment,
  onEvolve,
  notify,
}: {
  patient: Patient
  data: WorkspaceData
  run: RunAction
  pending: boolean
  initialTab?: PatientTab
  close: () => void
  onEdit: () => void
  onNewAppointment: () => void
  onNewConsultation: () => void
  onNewTreatment: () => void
  onEvolve: (appointmentId: string) => void
  notify: (message: string) => void
}) {
  const [tab, setTab] = useState<PatientTab>(initialTab ?? 'resumen')
  const [tooth, setTooth] = useState<number | null>(null)

  const patientConsultations = data.consultations.filter(
    (consultation) => consultation.patient_id === patient.id,
  )
  const patientAppointments = data.appointments.filter(
    (appointment) => appointment.patient_id === patient.id,
  )
  const patientPlans = data.treatmentPlans.filter((plan) => plan.patient_id === patient.id)
  const patientDocuments = data.documents.filter((document) => document.patient_id === patient.id)
  const findings = new Map(
    data.findings
      .filter((finding) => finding.patient_id === patient.id)
      .map((finding) => [finding.tooth_number, finding]),
  )
  const notedAppointmentIds = new Set(
    patientConsultations
      .map((consultation) => consultation.appointment_id)
      .filter((id): id is string => Boolean(id)),
  )
  const patientToothEvents = data.toothEvents.filter(
    (event) => event.patient_id === patient.id,
  )
  const toothHistory = tooth
    ? patientToothEvents.filter((event) => event.tooth_number === tooth)
    : []
  const nextAppointment = patientAppointments.find(
    (appointment) =>
      appointment.appointment_date >= data.today &&
      !['atendido', 'cancelado', 'no_asistio'].includes(appointment.status),
  )
  const lastConsultation = patientConsultations[0]
  const noShowWindowStart = addDaysIso(data.today, -182)
  const recentNoShows = patientAppointments.filter(
    (appointment) =>
      appointment.status === 'no_asistio' &&
      appointment.appointment_date >= noShowWindowStart,
  )
  const repeatedNoShows = recentNoShows.length >= 2
  const nowTime = new Date().toTimeString().slice(0, 5)
  const age = ageFromBirthDate(patient.birth_date)
  const toothStatuses = new Map(
    data.findings
      .filter((finding) => finding.patient_id === patient.id)
      .map((finding) => [finding.tooth_number, finding.status]),
  )

  const tabs: [PatientTab, string][] = [
    ['resumen', 'Resumen'],
    ['historia', 'Historia clínica'],
    ['odontograma', 'Odontograma'],
    ['tratamiento', 'Plan de tratamiento'],
    ['documentos', 'Documentos'],
  ]

  return (
    <div className="patient-detail">
      <button className="back-link" onClick={close}>
        <ChevronLeft /> Volver a pacientes
      </button>

      <div className="patient-hero">
        <div className="flex items-center gap-4">
          <Avatar patient={patient} />
          <div>
            <h1>{fullName(patient)}</h1>
            <p>
              {patient.phone || 'Sin WhatsApp'}
              {age !== null && (
                <>
                  <span className="dot-sep">·</span>
                  {age} años
                </>
              )}
              {patient.email && (
                <>
                  <span className="dot-sep">·</span>
                  {patient.email}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <ExportMenu
            onCsv={() => exportPatientCsv(data, patient)}
            onPdf={() => exportPatientPdf(data, patient)}
            notify={notify}
          />
          <button className="button button-secondary" onClick={onEdit}>
            <Pencil />
            Editar ficha
          </button>
          <button className="button button-secondary" onClick={onNewAppointment}>
            <CalendarDays />
            Nuevo turno
          </button>
          <button className="button button-primary" onClick={onNewConsultation}>
            <Stethoscope />
            Nueva consulta
          </button>
        </div>
      </div>

      <div className="patient-tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="detail-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Resumen clínico</h2>
                <p className="panel-subtitle">Información relevante del paciente</p>
              </div>
              <button className="text-button" onClick={() => notify('Usá las pestañas para editar la ficha clínica')}>
                Ver historia <ChevronRight />
              </button>
            </div>
            {repeatedNoShows && (
              <div className="medical-alert absence-alert">
                <UserX />
                <div>
                  <b>Ausencias repetidas</b>
                  <p>
                    Registra {recentNoShows.length} ausencias en los últimos 6 meses.
                    Considerá confirmar el turno antes de la cita.
                  </p>
                </div>
              </div>
            )}
            {patient.allergies && (
              <div className="medical-alert">
                <AlertCircle />
                <div>
                  <b>Alergia registrada</b>
                  <p>Este paciente tiene alergia a {patient.allergies}.</p>
                </div>
              </div>
            )}
            <div className="info-cards">
              <div>
                <span>Última visita</span>
                <strong>
                  {lastConsultation ? formatDate(lastConsultation.consultation_date) : 'Sin visitas'}
                </strong>
                <small>{lastConsultation?.reason || 'Sin consultas registradas'}</small>
              </div>
              <div>
                <span>Próximo turno</span>
                <strong>
                  {nextAppointment
                    ? `${formatDate(nextAppointment.appointment_date)} · ${formatTime(
                        nextAppointment.start_time,
                      )}`
                    : 'Sin turno'}
                </strong>
                <small>{nextAppointment ? APPOINTMENT_STATUS_LABEL[nextAppointment.status] : 'Agendá una visita'}</small>
              </div>
              <div>
                <span>Antecedentes</span>
                <strong>{patient.medical_history ? 'Registrados' : 'Sin datos'}</strong>
                <small>Información médica</small>
              </div>
            </div>
            <div className="section-divider" />
            <h3 className="section-title">Última consulta</h3>
            {lastConsultation ? (
              <div className="consultation-card">
                <div className="consultation-date">
                  <b>{lastConsultation.consultation_date.slice(8, 10)}</b>
                  <span>
                    {lastConsultation.consultation_date.slice(5, 7)}/
                    {lastConsultation.consultation_date.slice(0, 4)}
                  </span>
                </div>
                <div>
                  <b>{lastConsultation.procedure || lastConsultation.reason}</b>
                  <p>{lastConsultation.diagnosis || lastConsultation.notes || 'Sin detalle adicional.'}</p>
                  <span className="status-done">
                    {lastConsultation.appointment_id ? 'Evolución de turno' : 'Consulta registrada'}
                  </span>
                </div>
              </div>
            ) : (
              <InlineEmpty
                icon={<Stethoscope />}
                title="Sin consultas registradas"
                detail="Registrá la primera consulta de este paciente."
                action="Nueva consulta"
                onAction={onNewConsultation}
              />
            )}
            {patient.medical_history && (
              <>
                <div className="section-divider" />
                <h3 className="section-title">Antecedentes médicos</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {patient.medical_history}
                </p>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Datos de contacto</h2>
                <p className="panel-subtitle">Ficha administrativa</p>
              </div>
              <FileText className="size-5 text-[#99aaa4]" />
            </div>
            <div className="detail-list">
              <div>
                <span>WhatsApp</span>
                <strong>{patient.phone || 'Sin registrar'}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{patient.email || 'Sin registrar'}</strong>
              </div>
              <div>
                <span>Fecha de nacimiento</span>
                <strong>{formatDate(patient.birth_date)}</strong>
              </div>
              <div>
                <span>Alergias</span>
                <strong>{patient.allergies || 'Sin alergias conocidas'}</strong>
              </div>
              <div>
                <span>Ficha creada</span>
                <strong>{formatDate(patient.created_at)}</strong>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="button button-secondary flex-1" onClick={onEdit}>
                <Pencil />
                Editar datos
              </button>
              {patient.phone && (
                <a
                  className="button button-secondary flex-1"
                  href={
                    whatsappHref(
                      patient.phone,
                      `Hola ${patient.first_name}, te escribo desde ${data.practice.name}.`,
                    ) ?? undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle />
                  WhatsApp
                </a>
              )}
            </div>
            <button className="button button-secondary mt-2 w-full" onClick={onNewAppointment}>
              <CalendarDays />
              Agendar turno
            </button>
          </section>
        </div>
      )}

      {tab === 'historia' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Historia clínica</h2>
              <p className="panel-subtitle">Consultas registradas para este paciente</p>
            </div>
            <button className="button button-primary button-small" onClick={onNewConsultation}>
              <Plus />
              Nueva consulta
            </button>
          </div>
          <div className="history-list">
            {patientConsultations.length ? (
              patientConsultations.map((consultation) => (
                <div className="history-row" key={consultation.id}>
                  <div className="consultation-date">
                    <b>{consultation.consultation_date.slice(8, 10)}</b>
                    <span>
                      {consultation.consultation_date.slice(5, 7)}/
                      {consultation.consultation_date.slice(0, 4)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <strong>{consultation.procedure || consultation.reason}</strong>
                    {consultation.procedure && consultation.reason !== consultation.procedure && (
                      <p>Motivo: {consultation.reason}</p>
                    )}
                    {consultation.diagnosis && <p>Diagnóstico: {consultation.diagnosis}</p>}
                    {consultation.notes && <p>{consultation.notes}</p>}
                    {consultation.next_step && <p>Próximo paso: {consultation.next_step}</p>}
                    <small>
                      {formatDate(consultation.consultation_date)}
                      {consultation.appointment_id ? ' · Evolución de turno' : ''}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <InlineEmpty
                icon={<FileText />}
                title="Historia clínica vacía"
                detail="Las consultas que registres van a aparecer acá."
                action="Nueva consulta"
                onAction={onNewConsultation}
              />
            )}
          </div>
        </section>
      )}

      {tab === 'odontograma' && (
        <section className="panel odontogram-card">
          <div className="panel-header">
            <div>
              <h2>Odontograma</h2>
              <p className="panel-subtitle">Dentición permanente · FDI</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {findings.size} pieza(s) · {patientToothEvents.length} evento(s)
            </span>
          </div>
          <ToothGrid statuses={toothStatuses} selected={tooth} onSelect={setTooth} />
          <div className="legend">
            <span>
              <i className="legend-dot healthy" />
              Sano
            </span>
            <span>
              <i className="legend-dot issue" />
              Hallazgo
            </span>
            <span>
              <i className="legend-dot treated" />
              Tratado
            </span>
            <span>
              <i className="legend-dot selected" />
              Seleccionado
            </span>
          </div>
          {tooth && (
            <ToothEditor
              key={tooth}
              tooth={tooth}
              finding={findings.get(tooth)}
              history={toothHistory}
              patientId={patient.id}
              run={run}
              pending={pending}
              onClose={() => setTooth(null)}
            />
          )}
        </section>
      )}

      {tab === 'tratamiento' && (
        <div className="detail-grid">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Plan de tratamiento</h2>
                <p className="panel-subtitle">Seguimiento de procedimientos</p>
              </div>
              <button className="button button-primary button-small" onClick={onNewTreatment}>
                <Plus />
                Agregar
              </button>
            </div>
            <div className="history-list">
              {patientPlans.length ? (
                patientPlans.map((plan) => (
                  <div className="plan-row" key={plan.id}>
                    <div className="treatment-mark" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <strong>{plan.name}</strong>
                          <p>{plan.next_step || 'Sin próximo paso definido'}</p>
                        </div>
                        <span className={`status-${plan.status === 'completado' ? 'done' : plan.status === 'en_curso' ? 'progress' : 'pending'}`}>
                          {TREATMENT_STATUS_LABEL[plan.status]}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div style={{ width: `${plan.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <InlineEmpty
                  icon={<ClipboardList />}
                  title="Sin tratamientos planificados"
                  detail="Agregá un procedimiento para comenzar el seguimiento."
                  action="Agregar tratamiento"
                  onAction={onNewTreatment}
                />
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Turnos del paciente</h2>
                <p className="panel-subtitle">Historial de citas</p>
              </div>
              <CalendarDays className="size-5 text-[#99aaa4]" />
            </div>
            <div className="follow-up-list">
              {patientAppointments.length ? (
                patientAppointments.slice(0, 8).map((appointment) => {
                  const whatsapp = appointmentWhatsAppHref(
                    patient,
                    appointment,
                    data.practice.name,
                    {
                      cancellationPolicy: data.settings.cancellation_policy,
                      isFirstAppointment: patientAppointments.length === 1,
                    },
                  )
                  return (
                    <div className="follow-up-row" key={appointment.id}>
                      <div
                        className={`follow-up-dot ${
                          appointment.status === 'no_asistio' ? 'dot-amber' : 'dot-teal'
                        }`}
                      />
                      <div>
                        <strong>
                          {formatDate(appointment.appointment_date)} ·{' '}
                          {formatTime(appointment.start_time)}
                        </strong>
                        <p>{appointment.reason}</p>
                      </div>
                      {!notedAppointmentIds.has(appointment.id) &&
                        !['cancelado', 'no_asistio'].includes(appointment.status) &&
                        appointment.appointment_date <= data.today && (
                          <button
                            className="icon-button text-[#527f9f]"
                            onClick={() => onEvolve(appointment.id)}
                            aria-label="Registrar evolución del turno"
                            title="Registrar evolución"
                          >
                            <Stethoscope />
                          </button>
                        )}
                      {canMarkNoShow(appointment, data.today, nowTime) && (
                        <button
                          className="icon-button text-[#a36a3f]"
                          onClick={() => markNoShow(appointment, patient, run)}
                          disabled={pending}
                          aria-label="Marcar turno como no asistido"
                          title="No asistió"
                        >
                          <UserX />
                        </button>
                      )}
                      {whatsapp && (
                        <a
                          className="icon-button text-[#2f8b71]"
                          href={whatsapp}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Enviar WhatsApp del turno"
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle />
                        </a>
                      )}
                      <StatusBadge status={appointment.status} />
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-muted-foreground">Sin turnos registrados.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'documentos' && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Documentos</h2>
              <p className="panel-subtitle">Archivos privados asociados al paciente</p>
            </div>
            <FolderOpen className="size-5 text-[#99aaa4]" />
          </div>
          <form
            className="upload-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              const form = event.currentTarget
              const formData = new FormData(form)
              run(() => uploadDocumentAction(formData), 'Documento subido correctamente', () => form.reset())
            }}
          >
            <input type="hidden" name="patient_id" value={patient.id} />
            <label className="upload-label">
              <Upload />
              <span>Seleccionar archivo (PDF, JPG, PNG o WEBP · máx. 10 MB)</span>
              <input
                type="file"
                name="file"
                required
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                disabled={pending}
              />
            </label>
            <button className="button button-primary button-small" disabled={pending}>
              {pending ? 'Subiendo…' : 'Subir documento'}
            </button>
          </form>
          <div className="document-list">
            {patientDocuments.length ? (
              patientDocuments.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  pending={pending}
                  run={run}
                  notify={notify}
                />
              ))
            ) : (
              <InlineEmpty
                icon={<FolderOpen />}
                title="Todavía no hay documentos"
                detail="Los archivos que subas quedan protegidos y asociados a este paciente."
              />
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function ToothGrid({
  statuses,
  selected,
  draftTeeth,
  onSelect,
}: {
  statuses: Map<number, ToothStatus>
  selected: number | null
  draftTeeth?: Set<number>
  onSelect: (tooth: number) => void
}) {
  return (
    <div className="teeth-grid">
      {PERMANENT_TEETH.map((number) => {
        const status = statuses.get(number)
        return (
          <button
            key={number}
            type="button"
            onClick={() => onSelect(number)}
            className={`tooth ${status === 'hallazgo' ? 'tooth-issue' : ''} ${
              status === 'tratado' ? 'tooth-treated' : ''
            } ${selected === number ? 'tooth-selected' : ''} ${
              draftTeeth?.has(number) ? 'tooth-draft' : ''
            }`}
            aria-label={`Diente ${number}`}
            aria-pressed={selected === number}
          >
            <span>{number}</span>
            <div className="tooth-shape">
              <i />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ToothEditor({
  tooth,
  finding,
  history,
  patientId,
  run,
  pending,
  onClose,
}: {
  tooth: number
  finding?: OdontogramFinding
  history: ToothEvent[]
  patientId: string
  run: RunAction
  pending: boolean
  onClose: () => void
}) {
  const [status, setStatus] = useState<ToothStatus>(finding?.status ?? 'hallazgo')
  const [condition, setCondition] = useState(finding?.condition ?? '')
  const [notes, setNotes] = useState(finding?.notes ?? '')

  return (
    <div className="tooth-editor tooth-editor-form">
      <div className="tooth-editor-main">
        <div>
          <b>Pieza {tooth}</b>
          <p>El estado actual se calcula con el último evento del historial.</p>
        </div>
        <div className="tooth-editor-controls">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ToothStatus)}
            disabled={pending}
            aria-label="Estado de la pieza"
          >
            <option value="sano">Sano</option>
            <option value="hallazgo">Hallazgo</option>
            <option value="tratado">Tratado</option>
          </select>
          <input
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
            placeholder="Condición: caries, obturación..."
            maxLength={120}
            disabled={pending}
          />
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Observaciones (opcional)"
            maxLength={1000}
            disabled={pending}
          />
          <button
            className="button button-primary button-small"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  saveToothFindingAction({
                    patient_id: patientId,
                    tooth_number: tooth,
                    status,
                    condition,
                    notes,
                  }),
                `Pieza ${tooth} actualizada`,
              )
            }
          >
            Guardar evento
          </button>
          <button
            className="button button-secondary button-small"
            onClick={onClose}
            disabled={pending}
          >
            Cerrar
          </button>
        </div>
      </div>
      <div className="tooth-history">
        <div className="tooth-history-head">
          <b>Historial de la pieza {tooth}</b>
          <span>{history.length} evento(s)</span>
        </div>
        {history.length ? (
          <div className="tooth-history-list">
            {history.map((event) => (
              <div className="tooth-history-row" key={event.id}>
                <span className={`tooth-event-status tooth-event-${event.status}`}>
                  {TOOTH_STATUS_LABEL[event.status]}
                </span>
                <div>
                  <strong>
                    {formatDate(event.event_date)}
                    {event.condition ? ` · ${event.condition}` : ''}
                  </strong>
                  {event.notes && <p>{event.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="tooth-history-empty">
            Todavía no hay eventos. El primero va a quedar registrado como estado actual.
          </p>
        )}
      </div>
    </div>
  )
}

function DocumentRow({
  document,
  pending,
  run,
  notify,
}: {
  document: DocumentWithUrl
  pending: boolean
  run: RunAction
  notify: (message: string) => void
}) {
  return (
    <div className="document-row">
      <div className="document-icon">
        <FileText />
      </div>
      <div className="min-w-0">
        <strong>{document.name}</strong>
        <p>
          {formatDate(document.created_at)} · {formatBytes(document.size_bytes)}
        </p>
      </div>
      <div className="document-actions">
        {document.signed_url ? (
          <a
            href={document.signed_url}
            target="_blank"
            rel="noreferrer"
            className="icon-button"
            aria-label="Abrir documento"
          >
            <ExternalLink />
          </a>
        ) : (
          <span className="text-[10px] text-muted-foreground">Sin enlace</span>
        )}
        <button
          className="icon-button text-[#b05c60]"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`¿Eliminar "${document.name}"?`)) return
            run(() => deleteDocumentAction(document.id), 'Documento eliminado')
          }}
          aria-label="Eliminar documento"
        >
          <Trash2 />
        </button>
      </div>
    </div>
  )
}

function SettingsPage({
  data,
  run,
  pending,
}: {
  data: WorkspaceData
  run: RunAction
  pending: boolean
}) {
  const [form, setForm] = useState({
    full_name: data.profile.full_name,
    practice_name: data.practice.name,
    phone: data.practice.phone ?? data.profile.phone ?? '',
    default_duration_minutes: data.settings.default_duration_minutes,
    workday_start: data.settings.workday_start.slice(0, 5),
    workday_end: data.settings.workday_end.slice(0, 5),
    cancellation_policy: data.settings.cancellation_policy ?? '',
  })

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">CONFIGURACIÓN</p>
          <h1>Preferencias</h1>
          <p className="subheading">Personalizá tu consultorio y tu agenda.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <h2>Datos del consultorio</h2>
          <p className="panel-subtitle">
            Esta información identifica tu espacio privado en Molar.
          </p>
          <label>
            Nombre del consultorio
            <input
              value={form.practice_name}
              onChange={(event) => setForm({ ...form, practice_name: event.target.value })}
              maxLength={80}
              disabled={pending}
            />
          </label>
          <label>
            Nombre del profesional
            <input
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              maxLength={120}
              disabled={pending}
            />
          </label>
          <label>
            Teléfono de contacto <span className="optional">(opcional)</span>
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              maxLength={40}
              disabled={pending}
            />
          </label>
          <label>
            Email de la cuenta
            <input value={data.profile.email ?? ''} disabled readOnly />
          </label>
          <div className="connection-note">
            <ShieldCheck />
            <div>
              <b>Supabase conectado</b>
              <p>
                Los datos se guardan en tu espacio privado. Row Level Security impide que otras
                cuentas accedan a este consultorio.
              </p>
            </div>
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>Preferencias de agenda</h2>
          <p className="panel-subtitle">Definí cómo querés organizar tus turnos.</p>
          <label>
            Duración predeterminada
            <select
              value={form.default_duration_minutes}
              onChange={(event) =>
                setForm({ ...form, default_duration_minutes: Number(event.target.value) })
              }
              disabled={pending}
            >
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
              <option value={90}>90 minutos</option>
            </select>
          </label>
          <label>
            Inicio de atención
            <input
              type="time"
              value={form.workday_start}
              onChange={(event) => setForm({ ...form, workday_start: event.target.value })}
              disabled={pending}
            />
          </label>
          <label>
            Fin de atención
            <input
              type="time"
              value={form.workday_end}
              onChange={(event) => setForm({ ...form, workday_end: event.target.value })}
              disabled={pending}
            />
          </label>
          <label>
            Política de cancelación <span className="optional">(opcional)</span>
            <textarea
              value={form.cancellation_policy}
              onChange={(event) =>
                setForm({ ...form, cancellation_policy: event.target.value })
              }
              maxLength={1000}
              rows={4}
              placeholder="Ej: Avisá con al menos 24 horas de anticipación. Las cancelaciones tardías o ausencias pueden generar un cargo."
              disabled={pending}
            />
          </label>
          <p className="settings-hint">
            Se incluye en el WhatsApp del turno sólo la primera vez que el paciente agenda con
            el consultorio. Si lo dejás vacío, no se agrega.
          </p>
          <button
            className="button button-primary"
            disabled={pending}
            onClick={() => run(() => saveSettingsAction(form), 'Configuración guardada')}
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </section>
      </div>
    </>
  )
}

function Modal({
  title,
  close,
  children,
}: {
  title: string
  close: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">MOLAR / GESTIÓN</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function AppointmentModal({
  patients,
  appointments,
  scheduleBlocks,
  settings,
  today,
  practiceName,
  defaultPatientId,
  close,
  run,
  pending,
}: {
  patients: Patient[]
  appointments: Appointment[]
  scheduleBlocks: ScheduleBlock[]
  settings: WorkspaceData['settings']
  today: string
  practiceName: string
  defaultPatientId?: string
  close: () => void
  run: RunAction
  pending: boolean
}) {
  const [date, setDate] = useState(today)
  const [duration, setDuration] = useState(settings.default_duration_minutes)
  const [startTime, setStartTime] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [created, setCreated] = useState<{
    patientName: string
    date: string
    time: string
    whatsapp: string | null
  } | null>(null)
  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const slots = useMemo(
    () =>
      getAvailableSlots({
        date,
        duration,
        settings,
        appointments,
        scheduleBlocks,
        now,
      }),
    [date, duration, settings, appointments, scheduleBlocks, now],
  )

  useEffect(() => {
    if (!slots.includes(startTime)) setStartTime(slots[0] ?? '')
  }, [slots, startTime])

  return (
    <Modal title={created ? 'Turno agendado' : 'Nuevo turno'} close={close}>
      {created ? (
        <div className="appointment-success">
          <div className="appointment-success-icon">
            <Check />
          </div>
          <div>
            <h3>Turno agendado correctamente</h3>
            <p>
              {created.patientName} · {formatLongDate(created.date)} ·{' '}
              {formatTime(created.time)}
            </p>
          </div>
          {created.whatsapp ? (
            <a
              className="button button-primary"
              href={created.whatsapp}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle />
              Enviar por WhatsApp
            </a>
          ) : (
            <p className="appointment-success-note">
              Este paciente no tiene un WhatsApp válido registrado. Podés agregarlo desde su ficha.
            </p>
          )}
          <button className="button button-secondary" onClick={close}>
            Cerrar
          </button>
        </div>
      ) : (
        <>
          <p className="modal-intro">
            Agendá una nueva visita. Sólo vas a ver horarios libres y futuros.
          </p>
          {patients.length ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const patientId = String(form.get('patient_id') ?? '')
                const dateValue = String(form.get('appointment_date') ?? '')
                const timeValue = String(form.get('start_time') ?? '')
                const reason = String(form.get('reason') ?? '')
                const patient = patientById.get(patientId)

                run(
                  () =>
                    createAppointmentAction({
                      patient_id: patientId,
                      appointment_date: dateValue,
                      start_time: timeValue,
                      duration_minutes: Number(form.get('duration_minutes') ?? 45),
                      reason,
                      status: String(form.get('status') ?? 'pendiente') as AppointmentStatus,
                      notes: String(form.get('notes') ?? ''),
                    }),
                  'Turno creado correctamente',
                  (result) => {
                    const appointment = result.appointment
                    setCreated({
                      patientName: patient ? fullName(patient) : 'Paciente',
                      date: appointment?.appointment_date ?? dateValue,
                      time: appointment?.start_time ?? timeValue,
                      whatsapp: appointment
                        ? appointmentWhatsAppHref(patient, appointment, practiceName, {
                            cancellationPolicy: settings.cancellation_policy,
                            isFirstAppointment:
                              appointments.filter(
                                (item) => item.patient_id === patientId,
                              ).length === 0,
                          })
                        : null,
                    })
                  },
                )
              }}
            >
              <label>
                Paciente
                <select
                  name="patient_id"
                  required
                  defaultValue={defaultPatientId ?? ''}
                  disabled={pending}
                >
                  <option value="" disabled>
                    Seleccioná un paciente
                  </option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {fullName(patient)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Fecha
                  <input
                    type="date"
                    name="appointment_date"
                    value={date}
                    min={today}
                    onChange={(event) => setDate(event.target.value)}
                    required
                    disabled={pending}
                  />
                </label>
                <label>
                  Hora
                  <select
                    name="start_time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                    disabled={pending || !slots.length}
                  >
                    {slots.length ? (
                      slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin horarios disponibles</option>
                    )}
                  </select>
                  <span className={slots.length ? 'optional' : 'field-error'}>
                    {slots.length
                      ? 'Horarios ocupados o pasados no se muestran.'
                      : 'No quedan horarios libres para esta fecha y duración.'}
                  </span>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Duración
                  <select
                    name="duration_minutes"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    disabled={pending}
                  >
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>60 minutos</option>
                    <option value={90}>90 minutos</option>
                  </select>
                </label>
                <label>
                  Estado
                  <select name="status" defaultValue="pendiente" disabled={pending}>
                    <option value="confirmado">Confirmado</option>
                    <option value="pendiente">Pendiente de confirmar</option>
                  </select>
                </label>
              </div>
              <label>
                Motivo de consulta
                <input
                  name="reason"
                  placeholder="Ej: Control general"
                  maxLength={300}
                  required
                  disabled={pending}
                />
              </label>
              <label>
                Notas internas <span className="optional">(opcional)</span>
                <textarea
                  name="notes"
                  placeholder="Información adicional"
                  maxLength={2000}
                  disabled={pending}
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={close}>
                  Cancelar
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={pending || !slots.length}
                >
                  <Check />
                  {pending ? 'Guardando…' : 'Guardar turno'}
                </button>
              </div>
            </form>
          ) : (
            <div className="inline-empty">
              <div className="inline-empty-icon">
                <Users />
              </div>
              <div>
                <strong>Primero creá un paciente</strong>
                <p>Los turnos deben estar asociados a una ficha de tu consultorio.</p>
              </div>
              <button className="button button-secondary button-small ml-auto" onClick={close}>
                Entendido
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function PatientModal({
  patient,
  close,
  run,
  pending,
}: {
  patient?: Patient
  close: () => void
  run: RunAction
  pending: boolean
}) {
  const editing = Boolean(patient)
  return (
    <Modal title={editing ? 'Editar paciente' : 'Nuevo paciente'} close={close}>
      <p className="modal-intro">
        {editing
          ? 'Actualizá la ficha administrativa y clínica del paciente.'
          : 'Completá los datos básicos para crear una ficha.'}{' '}
        El WhatsApp se usa para enviar el turno.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const input = {
            first_name: String(form.get('first_name') ?? ''),
            last_name: String(form.get('last_name') ?? ''),
            phone: String(form.get('phone') ?? ''),
            email: String(form.get('email') ?? ''),
            birth_date: String(form.get('birth_date') ?? ''),
            allergies: String(form.get('allergies') ?? ''),
            medical_history: String(form.get('medical_history') ?? ''),
          }
          run(
            () =>
              patient ? updatePatientAction(patient.id, input) : createPatientAction(input),
            editing ? 'Paciente actualizado correctamente' : 'Paciente creado correctamente',
            close,
          )
        }}
      >
        <div className="form-row">
          <label>
            Nombre
            <input
              name="first_name"
              required
              placeholder="Nombre"
              maxLength={80}
              defaultValue={patient?.first_name ?? ''}
              disabled={pending}
            />
          </label>
          <label>
            Apellido
            <input
              name="last_name"
              required
              placeholder="Apellido"
              maxLength={80}
              defaultValue={patient?.last_name ?? ''}
              disabled={pending}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            WhatsApp <span className="optional">(con código de país)</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              required
              placeholder="+54 9 11..."
              maxLength={40}
              defaultValue={patient?.phone ?? ''}
              disabled={pending}
            />
          </label>
          <label>
            Fecha de nacimiento <span className="optional">(opcional)</span>
            <input
              type="date"
              name="birth_date"
              defaultValue={patient?.birth_date ?? ''}
              disabled={pending}
            />
          </label>
        </div>
        <label>
          Email <span className="optional">(opcional)</span>
          <input
            type="email"
            name="email"
            placeholder="nombre@email.com"
            maxLength={160}
            defaultValue={patient?.email ?? ''}
            disabled={pending}
          />
        </label>
        <label>
          Alergias <span className="optional">(opcional)</span>
          <input
            name="allergies"
            placeholder="Sin alergias conocidas"
            maxLength={500}
            defaultValue={patient?.allergies ?? ''}
            disabled={pending}
          />
        </label>
        <label>
          Antecedentes médicos <span className="optional">(opcional)</span>
          <textarea
            name="medical_history"
            placeholder="Información relevante para la atención"
            maxLength={2000}
            defaultValue={patient?.medical_history ?? ''}
            disabled={pending}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button button-primary" type="submit" disabled={pending}>
            <Check />
            {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar paciente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ConsultationModal({
  patient,
  today,
  close,
  run,
  pending,
}: {
  patient?: Patient
  today: string
  close: () => void
  run: RunAction
  pending: boolean
}) {
  if (!patient) return null
  return (
    <Modal title="Nueva consulta" close={close}>
      <p className="modal-intro">
        Registrá la consulta de {fullName(patient)} en su historia clínica.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          run(
            () =>
              createConsultationAction({
                patient_id: patient.id,
                consultation_date: String(form.get('consultation_date') ?? ''),
                reason: String(form.get('reason') ?? ''),
                procedure: String(form.get('procedure') ?? ''),
                next_step: String(form.get('next_step') ?? ''),
                diagnosis: String(form.get('diagnosis') ?? ''),
                notes: String(form.get('notes') ?? ''),
              }),
            'Consulta registrada correctamente',
            close,
          )
        }}
      >
        <label>
          Fecha
          <input
            type="date"
            name="consultation_date"
            defaultValue={today}
            required
            disabled={pending}
          />
        </label>
        <label>
          Motivo de consulta
          <input name="reason" required maxLength={300} placeholder="Ej: Control y seguimiento" disabled={pending} />
        </label>
        <label>
          Procedimiento realizado <span className="optional">(opcional)</span>
          <input
            name="procedure"
            maxLength={500}
            placeholder="Ej: Obturación pieza 15"
            disabled={pending}
          />
        </label>
        <label>
          Diagnóstico <span className="optional">(opcional)</span>
          <input name="diagnosis" maxLength={2000} placeholder="Diagnóstico clínico" disabled={pending} />
        </label>
        <label>
          Notas clínicas <span className="optional">(opcional)</span>
          <textarea name="notes" maxLength={4000} placeholder="Detalle de la atención" disabled={pending} />
        </label>
        <label>
          Próximo paso <span className="optional">(opcional)</span>
          <input
            name="next_step"
            maxLength={300}
            placeholder="Ej: Control en 7 días"
            disabled={pending}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button button-primary" type="submit" disabled={pending}>
            <Check />
            {pending ? 'Guardando…' : 'Guardar consulta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EvolutionWorkspace({
  appointment,
  patient,
  data,
  close,
  run,
  pending,
}: {
  appointment: Appointment
  patient: Patient
  data: WorkspaceData
  close: () => void
  run: RunAction
  pending: boolean
}) {
  const patientEvents = data.toothEvents.filter((event) => event.patient_id === patient.id)
  const latestByTooth = new Map<number, ToothEvent>()
  for (const event of patientEvents) {
    if (!latestByTooth.has(event.tooth_number)) latestByTooth.set(event.tooth_number, event)
  }

  const [drafts, setDrafts] = useState<Record<number, EvolutionToothDraft>>({})
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [editor, setEditor] = useState<EvolutionToothDraft | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const selectedDraft = selectedTooth ? drafts[selectedTooth] : undefined
  const selectedHistory = selectedTooth
    ? patientEvents.filter((event) => event.tooth_number === selectedTooth)
    : []
  const selectedCurrent = selectedTooth ? latestByTooth.get(selectedTooth) : undefined
  const draftTeeth = new Set(Object.keys(drafts).map(Number))

  const chartStatuses = new Map<number, ToothStatus>()
  for (const [tooth, event] of latestByTooth) chartStatuses.set(tooth, event.status)
  for (const [tooth, draft] of Object.entries(drafts)) {
    chartStatuses.set(Number(tooth), draft.status)
  }

  const closeEditor = () => {
    setSelectedTooth(null)
    setEditor(null)
  }

  const selectTooth = (tooth: number) => {
    if (selectedTooth === tooth) {
      closeEditor()
      return
    }
    setSelectedTooth(tooth)
    const draft = drafts[tooth]
    if (draft) {
      setEditor(draft)
      return
    }
    const current = latestByTooth.get(tooth)
    setEditor({
      status: 'tratado',
      condition: current?.condition ?? '',
      notes: '',
    })
  }

  const updateEditor = (patch: Partial<EvolutionToothDraft>) => {
    if (!editor) return
    const next = { ...editor, ...patch }
    setEditor(next)
    if (selectedTooth && drafts[selectedTooth]) {
      setDrafts((current) => ({ ...current, [selectedTooth]: next }))
    }
  }

  const saveDraft = () => {
    if (!selectedTooth || !editor) return
    setDrafts((current) => ({ ...current, [selectedTooth]: editor }))
  }

  const removeDraft = (tooth: number) => {
    setDrafts((current) => {
      const next = { ...current }
      delete next[tooth]
      return next
    })
    if (selectedTooth === tooth) {
      const current = latestByTooth.get(tooth)
      setEditor({
        status: 'tratado',
        condition: current?.condition ?? '',
        notes: '',
      })
    }
  }

  return (
    <div className="evolution-screen">
      <div className="evolution-screen-inner">
        <header className="evolution-screen-header">
          <div>
            <button className="back-link" type="button" onClick={close}>
              <ChevronLeft /> Volver
            </button>
            <p className="eyebrow">REGISTRAR EVOLUCIÓN</p>
            <h1>{fullName(patient)}</h1>
            <div className="evolution-screen-meta">
              <span>
                {formatLongDate(appointment.appointment_date)} ·{' '}
                {formatTime(appointment.start_time)}
              </span>
              <span className="dot-sep">·</span>
              <span>{appointment.reason}</span>
              <StatusBadge status={appointment.status} />
            </div>
          </div>
          <div className="header-actions">
            <button className="button button-secondary" type="button" onClick={close}>
              <X />
              Cerrar
            </button>
          </div>
        </header>

        <div className="evolution-screen-grid">
          <section className="panel evolution-chart-panel">
            <div className="panel-header">
              <div>
                <h2>Odontograma del turno</h2>
                <p className="panel-subtitle">
                  Tocá las piezas trabajadas y completá el estado de cada una.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {draftTeeth.size} pieza(s) en este turno
              </span>
            </div>

            <ToothGrid
              statuses={chartStatuses}
              selected={selectedTooth}
              draftTeeth={draftTeeth}
              onSelect={selectTooth}
            />

            <div className="legend">
              <span>
                <i className="legend-dot healthy" />
                Sano
              </span>
              <span>
                <i className="legend-dot issue" />
                Hallazgo
              </span>
              <span>
                <i className="legend-dot treated" />
                Tratado
              </span>
              <span>
                <i className="legend-dot draft" />
                En este turno
              </span>
            </div>

            {selectedTooth && editor ? (
              <div className="evolution-tooth-editor">
                <div className="evolution-tooth-editor-head">
                  <div>
                    <b>Pieza {selectedTooth}</b>
                    <p>
                      Estado actual:{' '}
                      {selectedCurrent
                        ? `${TOOTH_STATUS_LABEL[selectedCurrent.status]}${
                            selectedCurrent.condition ? ` · ${selectedCurrent.condition}` : ''
                          }`
                        : 'sin eventos previos'}
                    </p>
                  </div>
                  {selectedDraft && <span className="evolution-draft-badge">En este turno</span>}
                </div>

                <div className="evolution-status-options">
                  {TOOTH_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`evolution-status-option ${
                        editor.status === status ? 'active' : ''
                      }`}
                      onClick={() => updateEditor({ status })}
                      disabled={pending}
                    >
                      {TOOTH_STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>

                <div className="form-row">
                  <label>
                    Condición
                    <input
                      value={editor.condition}
                      onChange={(event) => updateEditor({ condition: event.target.value })}
                      placeholder="Ej: caries, obturación, control"
                      maxLength={120}
                      disabled={pending}
                    />
                  </label>
                  <label>
                    Notas de la pieza
                    <input
                      value={editor.notes}
                      onChange={(event) => updateEditor({ notes: event.target.value })}
                      placeholder="Observaciones (opcional)"
                      maxLength={1000}
                      disabled={pending}
                    />
                  </label>
                </div>

                <div className="evolution-tooth-actions">
                  <button
                    type="button"
                    className="button button-primary button-small"
                    onClick={saveDraft}
                    disabled={pending}
                  >
                    <Check />
                    {selectedDraft ? 'Actualizar pieza' : 'Agregar al turno'}
                  </button>
                  {selectedDraft && (
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => removeDraft(selectedTooth)}
                      disabled={pending}
                    >
                      <Trash2 />
                      Quitar
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={closeEditor}
                    disabled={pending}
                  >
                    <X />
                    Cancelar
                  </button>
                </div>

                <div className="tooth-history">
                  <div className="tooth-history-head">
                    <b>Historial de la pieza {selectedTooth}</b>
                    <span>{selectedHistory.length} evento(s)</span>
                  </div>
                  {selectedHistory.length ? (
                    <div className="tooth-history-list">
                      {selectedHistory.slice(0, 5).map((event) => (
                        <div className="tooth-history-row" key={event.id}>
                          <span className={`tooth-event-status tooth-event-${event.status}`}>
                            {TOOTH_STATUS_LABEL[event.status]}
                          </span>
                          <div>
                            <strong>
                              {formatDate(event.event_date)}
                              {event.condition ? ` · ${event.condition}` : ''}
                            </strong>
                            {event.notes && <p>{event.notes}</p>}
                            <small className="optional">
                              {event.appointment_id ? 'Registrado en un turno' : 'Registro de odontograma'}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="tooth-history-empty">
                      Todavía no hay eventos. El primero va a quedar registrado como estado actual.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="evolution-hint">
                Tocá una pieza del odontograma para registrar qué se encontró o se trató en este
                turno.
              </p>
            )}
          </section>

          <form
            className="panel evolution-form-panel"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              run(
                () =>
                  createConsultationAction({
                    patient_id: patient.id,
                    appointment_id: appointment.id,
                    consultation_date: appointment.appointment_date,
                    reason: appointment.reason,
                    procedure: String(form.get('procedure') ?? ''),
                    diagnosis: String(form.get('diagnosis') ?? ''),
                    notes: String(form.get('notes') ?? ''),
                    next_step: String(form.get('next_step') ?? ''),
                    tooth_events: Object.entries(drafts).map(([tooth, draft]) => ({
                      tooth_number: Number(tooth),
                      status: draft.status,
                      condition: draft.condition,
                      notes: draft.notes,
                    })),
                  }),
                'Evolución registrada y turno cerrado',
                close,
              )
            }}
          >
            <div className="panel-header">
              <div>
                <h2>Registro clínico</h2>
                <p className="panel-subtitle">
                  La evolución queda vinculada a este turno y a la historia del paciente.
                </p>
              </div>
            </div>

            {(patient.allergies || patient.medical_history) && (
              <div className="medical-alert">
                <AlertCircle />
                <div>
                  <b>Antecedentes del paciente</b>
                  {patient.allergies && <p>Alergias: {patient.allergies}</p>}
                  {patient.medical_history && <p>{patient.medical_history}</p>}
                </div>
              </div>
            )}

            <label>
              Procedimiento realizado
              <textarea
                name="procedure"
                required
                maxLength={500}
                placeholder="Ej: Obturación en pieza 15, control de caries..."
                disabled={pending}
              />
            </label>
            <label>
              Diagnóstico <span className="optional">(opcional)</span>
              <input
                name="diagnosis"
                maxLength={2000}
                placeholder="Diagnóstico clínico"
                disabled={pending}
              />
            </label>
            <label>
              Notas clínicas <span className="optional">(opcional)</span>
              <textarea
                name="notes"
                maxLength={4000}
                placeholder="Detalle de la atención, materiales, indicaciones..."
                disabled={pending}
              />
            </label>
            <label>
              Próximo paso <span className="optional">(opcional)</span>
              <input
                name="next_step"
                maxLength={300}
                placeholder="Ej: Control en 7 días"
                disabled={pending}
              />
            </label>

            <div className="evolution-teeth-summary">
              <div className="evolution-teeth-summary-head">
                <b>Piezas de este turno</b>
                <span>{draftTeeth.size}</span>
              </div>
              {draftTeeth.size ? (
                <div className="evolution-tooth-chips">
                  {Object.entries(drafts).map(([tooth, draft]) => (
                    <div className="evolution-tooth-chip" key={tooth}>
                      <button
                        type="button"
                        className="evolution-tooth-chip-main"
                        onClick={() => selectTooth(Number(tooth))}
                        disabled={pending}
                      >
                        <b>Pieza {tooth}</b>
                        <span className={`tooth-event-status tooth-event-${draft.status}`}>
                          {TOOTH_STATUS_LABEL[draft.status]}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="evolution-tooth-chip-remove"
                        onClick={() => removeDraft(Number(tooth))}
                        aria-label={`Quitar pieza ${tooth}`}
                        disabled={pending}
                      >
                        <X />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="tooth-history-empty">
                  Sin piezas todavía. Podés guardar la evolución igual.
                </p>
              )}
            </div>

            <div className="evolution-note">
              <Stethoscope />
              <span>
                Al guardar, el turno se marca como atendido y cada pieza queda fechada con el día
                del turno.
              </span>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={close}>
                Cancelar
              </button>
              <button className="button button-primary" type="submit" disabled={pending}>
                <Check />
                {pending ? 'Guardando…' : 'Guardar evolución'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function TreatmentModal({
  patient,
  close,
  run,
  pending,
}: {
  patient?: Patient
  close: () => void
  run: RunAction
  pending: boolean
}) {
  if (!patient) return null
  return (
    <Modal title="Nuevo tratamiento" close={close}>
      <p className="modal-intro">
        Agregá un procedimiento al plan de {fullName(patient)}.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          run(
            () =>
              createTreatmentPlanAction({
                patient_id: patient.id,
                name: String(form.get('name') ?? ''),
                status: String(form.get('status') ?? 'pendiente') as
                  | 'pendiente'
                  | 'en_curso'
                  | 'completado',
                progress: Number(form.get('progress') ?? 0),
                next_step: String(form.get('next_step') ?? ''),
                notes: String(form.get('notes') ?? ''),
              }),
            'Plan de tratamiento guardado',
            close,
          )
        }}
      >
        <label>
          Nombre del tratamiento
          <input name="name" required maxLength={160} placeholder="Ej: Corona pieza 16" disabled={pending} />
        </label>
        <div className="form-row">
          <label>
            Estado
            <select name="status" defaultValue="pendiente" disabled={pending}>
              <option value="pendiente">Pendiente</option>
              <option value="en_curso">En curso</option>
              <option value="completado">Completado</option>
            </select>
          </label>
          <label>
            Progreso (%)
            <input
              type="number"
              name="progress"
              min={0}
              max={100}
              defaultValue={0}
              required
              disabled={pending}
            />
          </label>
        </div>
        <label>
          Próximo paso <span className="optional">(opcional)</span>
          <input name="next_step" maxLength={160} placeholder="Ej: Control" disabled={pending} />
        </label>
        <label>
          Notas <span className="optional">(opcional)</span>
          <textarea name="notes" maxLength={2000} placeholder="Detalle del plan" disabled={pending} />
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={close}>
            Cancelar
          </button>
          <button className="button button-primary" type="submit" disabled={pending}>
            <Check />
            {pending ? 'Guardando…' : 'Guardar tratamiento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
