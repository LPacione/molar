import {
  ageFromBirthDate,
  APPOINTMENT_STATUS_LABEL,
  formatBytes,
  formatDate,
  formatTime,
  fullName,
  todayIso,
  TREATMENT_STATUS_LABEL,
} from '@/lib/format'
import type {
  DocumentWithUrl,
  OdontogramFinding,
  Patient,
  ToothStatus,
  WorkspaceData,
} from '@/lib/types'

type CsvFile = {
  name: string
  content: string
}

type JsPdfDoc = import('jspdf').jsPDF
type AutoTableFn = typeof import('jspdf-autotable').default
type AutoTableOptions = NonNullable<Parameters<AutoTableFn>[1]>

const CSV_BOM = '\uFEFF'
const PDF_MARGIN = 14
const PDF_WIDTH = 210
const PDF_HEIGHT = 297
const PDF_CONTENT_WIDTH = PDF_WIDTH - PDF_MARGIN * 2
const PDF_BOTTOM = 282
const PDF_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38, 48, 47, 46, 45, 44, 43, 42, 41,
]

const TOOTH_STATUS_LABEL: Record<ToothStatus, string> = {
  sano: 'Sano',
  hallazgo: 'Hallazgo',
  tratado: 'Tratado',
}

const TOOTH_STATUS_COLOR: Record<ToothStatus, [number, number, number]> = {
  sano: [239, 243, 240],
  hallazgo: [255, 243, 217],
  tratado: [228, 243, 238],
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvFile(name: string, headers: string[], rows: unknown[][]): CsvFile {
  return {
    name,
    content:
      CSV_BOM +
      [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join(
        '\r\n',
      ) +
      '\r\n',
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'archivo'
}

function exportedDocumentName(document: DocumentWithUrl) {
  return `${document.id}-${safeFileName(document.name)}`
}

function exportedDocumentPath(document: DocumentWithUrl) {
  return `documentos/${exportedDocumentName(document)}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function sortedPatients(patients: Patient[]) {
  return [...patients].sort((a, b) => fullName(a).localeCompare(fullName(b), 'es'))
}

function patientData(data: WorkspaceData, patient: Patient) {
  return {
    appointments: data.appointments.filter(
      (appointment) => appointment.patient_id === patient.id,
    ),
    consultations: data.consultations.filter(
      (consultation) => consultation.patient_id === patient.id,
    ),
    findings: data.findings
      .filter((finding) => finding.patient_id === patient.id)
      .sort((a, b) => a.tooth_number - b.tooth_number),
    toothEvents: data.toothEvents.filter((event) => event.patient_id === patient.id),
    treatmentPlans: data.treatmentPlans.filter(
      (plan) => plan.patient_id === patient.id,
    ),
    documents: data.documents.filter((document) => document.patient_id === patient.id),
  }
}

function practiceCsvFiles(data: WorkspaceData): CsvFile[] {
  return [
    csvFile(
      'consultorio.csv',
      ['id', 'name', 'phone', 'owner_id', 'created_at', 'updated_at'],
      [
        [
          data.practice.id,
          data.practice.name,
          data.practice.phone,
          data.practice.owner_id,
          data.practice.created_at,
          data.practice.updated_at,
        ],
      ],
    ),
    csvFile(
      'configuracion.csv',
      [
        'practice_id',
        'default_duration_minutes',
        'workday_start',
        'workday_end',
        'cancellation_policy',
      ],
      [
        [
          data.settings.practice_id,
          data.settings.default_duration_minutes,
          data.settings.workday_start,
          data.settings.workday_end,
          data.settings.cancellation_policy,
        ],
      ],
    ),
    csvFile(
      'pacientes.csv',
      [
        'id',
        'practice_id',
        'first_name',
        'last_name',
        'phone',
        'email',
        'birth_date',
        'allergies',
        'medical_history',
        'created_at',
        'updated_at',
      ],
      data.patients.map((patient) => [
        patient.id,
        patient.practice_id,
        patient.first_name,
        patient.last_name,
        patient.phone,
        patient.email,
        patient.birth_date,
        patient.allergies,
        patient.medical_history,
        patient.created_at,
        patient.updated_at,
      ]),
    ),
    csvFile(
      'turnos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'appointment_date',
        'start_time',
        'duration_minutes',
        'reason',
        'status',
        'notes',
        'created_at',
        'updated_at',
      ],
      data.appointments.map((appointment) => [
        appointment.id,
        appointment.practice_id,
        appointment.patient_id,
        appointment.appointment_date,
        appointment.start_time,
        appointment.duration_minutes,
        appointment.reason,
        appointment.status,
        appointment.notes,
        appointment.created_at,
        appointment.updated_at,
      ]),
    ),
    csvFile(
      'consultas.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'appointment_id',
        'consultation_date',
        'reason',
        'procedure',
        'next_step',
        'notes',
        'diagnosis',
        'created_at',
      ],
      data.consultations.map((consultation) => [
        consultation.id,
        consultation.practice_id,
        consultation.patient_id,
        consultation.appointment_id,
        consultation.consultation_date,
        consultation.reason,
        consultation.procedure,
        consultation.next_step,
        consultation.notes,
        consultation.diagnosis,
        consultation.created_at,
      ]),
    ),
    csvFile(
      'odontograma_actual.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'tooth_number',
        'status',
        'condition',
        'notes',
        'event_date',
        'updated_at',
      ],
      data.findings.map((finding) => [
        finding.id,
        finding.practice_id,
        finding.patient_id,
        finding.tooth_number,
        finding.status,
        finding.condition,
        finding.notes,
        finding.event_date,
        finding.updated_at,
      ]),
    ),
    csvFile(
      'odontograma_historial.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'tooth_number',
        'appointment_id',
        'consultation_id',
        'event_date',
        'status',
        'condition',
        'notes',
        'created_at',
      ],
      data.toothEvents.map((event) => [
        event.id,
        event.practice_id,
        event.patient_id,
        event.tooth_number,
        event.appointment_id,
        event.consultation_id,
        event.event_date,
        event.status,
        event.condition,
        event.notes,
        event.created_at,
      ]),
    ),
    csvFile(
      'tratamientos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'name',
        'status',
        'progress',
        'next_step',
        'notes',
        'created_at',
        'updated_at',
      ],
      data.treatmentPlans.map((plan) => [
        plan.id,
        plan.practice_id,
        plan.patient_id,
        plan.name,
        plan.status,
        plan.progress,
        plan.next_step,
        plan.notes,
        plan.created_at,
        plan.updated_at,
      ]),
    ),
    csvFile(
      'documentos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'name',
        'storage_path',
        'mime_type',
        'size_bytes',
        'created_at',
        'archivo_exportado',
      ],
      data.documents.map((document) => [
        document.id,
        document.practice_id,
        document.patient_id,
        document.name,
        document.storage_path,
        document.mime_type,
        document.size_bytes,
        document.created_at,
        document.signed_url ? exportedDocumentPath(document) : '',
      ]),
    ),
    csvFile(
      'bloqueos_agenda.csv',
      [
        'id',
        'practice_id',
        'block_date',
        'start_time',
        'end_time',
        'reason',
        'created_at',
      ],
      data.scheduleBlocks.map((block) => [
        block.id,
        block.practice_id,
        block.block_date,
        block.start_time,
        block.end_time,
        block.reason,
        block.created_at,
      ]),
    ),
  ]
}

function patientCsvFiles(data: WorkspaceData, patient: Patient): CsvFile[] {
  const related = patientData(data, patient)
  return [
    csvFile(
      'paciente.csv',
      [
        'id',
        'practice_id',
        'first_name',
        'last_name',
        'phone',
        'email',
        'birth_date',
        'allergies',
        'medical_history',
        'created_at',
        'updated_at',
      ],
      [
        [
          patient.id,
          patient.practice_id,
          patient.first_name,
          patient.last_name,
          patient.phone,
          patient.email,
          patient.birth_date,
          patient.allergies,
          patient.medical_history,
          patient.created_at,
          patient.updated_at,
        ],
      ],
    ),
    csvFile(
      'turnos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'appointment_date',
        'start_time',
        'duration_minutes',
        'reason',
        'status',
        'notes',
        'created_at',
        'updated_at',
      ],
      related.appointments.map((appointment) => [
        appointment.id,
        appointment.practice_id,
        appointment.patient_id,
        appointment.appointment_date,
        appointment.start_time,
        appointment.duration_minutes,
        appointment.reason,
        appointment.status,
        appointment.notes,
        appointment.created_at,
        appointment.updated_at,
      ]),
    ),
    csvFile(
      'consultas.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'appointment_id',
        'consultation_date',
        'reason',
        'procedure',
        'next_step',
        'notes',
        'diagnosis',
        'created_at',
      ],
      related.consultations.map((consultation) => [
        consultation.id,
        consultation.practice_id,
        consultation.patient_id,
        consultation.appointment_id,
        consultation.consultation_date,
        consultation.reason,
        consultation.procedure,
        consultation.next_step,
        consultation.notes,
        consultation.diagnosis,
        consultation.created_at,
      ]),
    ),
    csvFile(
      'odontograma_actual.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'tooth_number',
        'status',
        'condition',
        'notes',
        'event_date',
        'updated_at',
      ],
      related.findings.map((finding) => [
        finding.id,
        finding.practice_id,
        finding.patient_id,
        finding.tooth_number,
        finding.status,
        finding.condition,
        finding.notes,
        finding.event_date,
        finding.updated_at,
      ]),
    ),
    csvFile(
      'odontograma_historial.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'tooth_number',
        'appointment_id',
        'consultation_id',
        'event_date',
        'status',
        'condition',
        'notes',
        'created_at',
      ],
      related.toothEvents.map((event) => [
        event.id,
        event.practice_id,
        event.patient_id,
        event.tooth_number,
        event.appointment_id,
        event.consultation_id,
        event.event_date,
        event.status,
        event.condition,
        event.notes,
        event.created_at,
      ]),
    ),
    csvFile(
      'tratamientos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'name',
        'status',
        'progress',
        'next_step',
        'notes',
        'created_at',
        'updated_at',
      ],
      related.treatmentPlans.map((plan) => [
        plan.id,
        plan.practice_id,
        plan.patient_id,
        plan.name,
        plan.status,
        plan.progress,
        plan.next_step,
        plan.notes,
        plan.created_at,
        plan.updated_at,
      ]),
    ),
    csvFile(
      'documentos.csv',
      [
        'id',
        'practice_id',
        'patient_id',
        'name',
        'storage_path',
        'mime_type',
        'size_bytes',
        'created_at',
        'archivo_exportado',
      ],
      related.documents.map((document) => [
        document.id,
        document.practice_id,
        document.patient_id,
        document.name,
        document.storage_path,
        document.mime_type,
        document.size_bytes,
        document.created_at,
        document.signed_url ? exportedDocumentPath(document) : '',
      ]),
    ),
  ]
}

function buildReadme(
  data: WorkspaceData,
  patient: Patient | null,
  files: CsvFile[],
  documentCount: number,
) {
  return [
    'Exportación de Molar',
    '',
    `Consultorio: ${data.practice.name}`,
    `Alcance: ${patient ? fullName(patient) : 'todos los pacientes'}`,
    `Exportado: ${formatDate(todayIso())}`,
    '',
    'Formato: CSV UTF-8 con BOM, separado por comas. Las fechas se exportan como AAAA-MM-DD.',
    `Documentos: ${documentCount ? `se incluyen ${documentCount} archivo(s) en la carpeta documentos/.` : 'no hay archivos para incluir.'}`,
    'No se exportan los tokens públicos de los turnos.',
    '',
    'Archivos:',
    ...files.map((file) => `- ${file.name}`),
    ...(documentCount ? ['- documentos/ (archivos adjuntos)'] : []),
  ].join('\r\n')
}

function buildManifest(
  data: WorkspaceData,
  patient: Patient | null,
  files: CsvFile[],
  documentCount: number,
) {
  return JSON.stringify(
    {
      app: 'Molar',
      exported_at: new Date().toISOString(),
      scope: patient ? 'patient' : 'practice',
      practice: {
        id: data.practice.id,
        name: data.practice.name,
      },
      patient: patient
        ? {
            id: patient.id,
            name: fullName(patient),
          }
        : null,
      files: [
        ...files.map((file) => file.name),
        ...(documentCount ? ['documentos/'] : []),
        'LEEME.txt',
        'manifest.json',
      ],
    },
    null,
    2,
  )
}

async function buildZip(
  data: WorkspaceData,
  patient: Patient | null,
  files: CsvFile[],
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.content)

  const documents = patient
    ? patientData(data, patient).documents
    : data.documents
  const documentsFolder = documents.length ? zip.folder('documentos') : null
  let includedDocuments = 0

  if (documentsFolder) {
    await Promise.all(
      documents.map(async (document) => {
        if (!document.signed_url) return
        try {
          const response = await fetch(document.signed_url)
          if (!response.ok) return
          documentsFolder.file(exportedDocumentName(document), await response.blob())
          includedDocuments += 1
        } catch (error) {
          console.error('No se pudo incluir un documento en la exportación:', error)
        }
      }),
    )
  }

  zip.file('LEEME.txt', buildReadme(data, patient, files, includedDocuments))
  zip.file('manifest.json', buildManifest(data, patient, files, includedDocuments))

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

export async function exportPatientCsv(data: WorkspaceData, patient: Patient) {
  const files = patientCsvFiles(data, patient)
  const blob = await buildZip(data, patient, files)
  downloadBlob(
    blob,
    `molar-${slugify(data.practice.name)}-${slugify(fullName(patient))}-${todayIso()}.zip`,
  )
}

export async function exportAllPatientsCsv(data: WorkspaceData) {
  const files = practiceCsvFiles(data)
  const blob = await buildZip(data, null, files)
  downloadBlob(
    blob,
    `molar-${slugify(data.practice.name)}-todos-los-datos-${todayIso()}.zip`,
  )
}

function lastAutoTableY(doc: JsPdfDoc, fallback: number) {
  const last = (doc as JsPdfDoc & { lastAutoTable?: { finalY?: number } }).lastAutoTable
  return last?.finalY ?? fallback
}

function drawTable(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  options: AutoTableOptions,
  fallbackY: number,
) {
  autoTable(doc, options)
  return lastAutoTableY(doc, fallbackY)
}

function ensureSpace(doc: JsPdfDoc, y: number, needed = 28) {
  if (y + needed <= PDF_BOTTOM) return y
  doc.addPage()
  return PDF_MARGIN + 6
}

function sectionTitle(doc: JsPdfDoc, title: string, y: number, needed = 45) {
  const nextY = ensureSpace(doc, y, needed)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(39, 125, 110)
  doc.text(title.toUpperCase(), PDF_MARGIN, nextY)
  doc.setDrawColor(220, 232, 226)
  doc.line(PDF_MARGIN, nextY + 2, PDF_WIDTH - PDF_MARGIN, nextY + 2)
  return nextY + 7
}

function emptyTableMessage(doc: JsPdfDoc, y: number, message = 'Sin registros.') {
  const nextY = ensureSpace(doc, y, 12)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.setTextColor(130, 145, 139)
  doc.text(message, PDF_MARGIN, nextY + 3)
  return nextY + 10
}

function tableOptions(): Omit<AutoTableOptions, 'startY' | 'head' | 'body'> {
  return {
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.8,
      overflow: 'linebreak',
      textColor: [40, 50, 48],
    },
    headStyles: {
      fillColor: [39, 125, 110],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [247, 250, 248],
    },
    margin: {
      left: PDF_MARGIN,
      right: PDF_MARGIN,
      top: 18,
      bottom: 18,
    },
  }
}

function addFooter(doc: JsPdfDoc, exportedAt: string) {
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(140, 152, 146)
    doc.text(`Molar · Exportado el ${exportedAt}`, PDF_MARGIN, PDF_HEIGHT - 8)
    doc.text(`Página ${page} de ${pages}`, PDF_WIDTH - PDF_MARGIN, PDF_HEIGHT - 8, {
      align: 'right',
    })
  }
}

function drawOdontogram(
  doc: JsPdfDoc,
  findings: OdontogramFinding[],
  startY: number,
) {
  let y = ensureSpace(doc, startY, 52)
  const byTooth = new Map(findings.map((finding) => [finding.tooth_number, finding]))
  const cellWidth = PDF_CONTENT_WIDTH / 16
  const cellHeight = 9
  const gap = 1.5

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const tooth = PDF_TEETH[row * 16 + column]
      const finding = byTooth.get(tooth)
      const color = finding ? TOOTH_STATUS_COLOR[finding.status] : [247, 250, 248]
      const x = PDF_MARGIN + column * cellWidth
      const cellY = y + row * (cellHeight + gap)
      doc.setFillColor(color[0], color[1], color[2])
      doc.setDrawColor(219, 229, 224)
      doc.rect(x, cellY, cellWidth - 0.6, cellHeight, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6)
      doc.setTextColor(60, 80, 74)
      doc.text(String(tooth), x + (cellWidth - 0.6) / 2, cellY + 4.2, {
        align: 'center',
      })
      if (finding) {
        const mark =
          finding.status === 'sano' ? 'S' : finding.status === 'hallazgo' ? 'H' : 'T'
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(4.5)
        doc.text(mark, x + (cellWidth - 0.6) / 2, cellY + 7.3, { align: 'center' })
      }
    }
  }

  y += 2 * (cellHeight + gap) + 5
  const legend: Array<[string, [number, number, number]]> = [
    ['Sano', TOOTH_STATUS_COLOR.sano],
    ['Hallazgo', TOOTH_STATUS_COLOR.hallazgo],
    ['Tratado', TOOTH_STATUS_COLOR.tratado],
    ['Sin registro', [247, 250, 248]],
  ]
  let legendX = PDF_MARGIN
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 115, 108)
  for (const [label, color] of legend) {
    doc.setFillColor(color[0], color[1], color[2])
    doc.setDrawColor(219, 229, 224)
    doc.rect(legendX, y - 2.8, 3, 3, 'FD')
    doc.text(label, legendX + 4.5, y)
    legendX += 33
  }

  return y + 7
}

function addPatientPdf(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  data: WorkspaceData,
  patient: Patient,
) {
  const related = patientData(data, patient)
  const age = ageFromBirthDate(patient.birth_date)
  let y = PDF_MARGIN + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(39, 125, 110)
  doc.text(data.practice.name.toUpperCase(), PDF_MARGIN, y)

  y += 8
  doc.setFontSize(18)
  doc.setTextColor(31, 43, 42)
  doc.text('Historia clínica', PDF_MARGIN, y)

  y += 8
  doc.setFontSize(15)
  doc.text(fullName(patient), PDF_MARGIN, y)

  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(109, 129, 121)
  doc.text(
    `Ficha creada: ${formatDate(patient.created_at)}${age !== null ? ` · ${age} años` : ''}`,
    PDF_MARGIN,
    y,
  )

  y += 8
  y = drawTable(
    doc,
    autoTable,
    {
      ...tableOptions(),
      startY: y,
      head: [['Ficha técnica', 'Detalle']],
      body: [
        ['Nombre completo', fullName(patient)],
        ['Fecha de nacimiento', patient.birth_date ? formatDate(patient.birth_date) : 'Sin registrar'],
        ['Edad', age !== null ? `${age} años` : 'Sin registrar'],
        ['Teléfono', patient.phone || 'Sin registrar'],
        ['Email', patient.email || 'Sin registrar'],
        ['Alergias', patient.allergies || 'Sin registrar'],
        ['Antecedentes médicos', patient.medical_history || 'Sin registrar'],
      ],
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold', fillColor: [247, 250, 248] },
        1: { cellWidth: PDF_CONTENT_WIDTH - 38 },
      },
    },
    y,
  )

  y += 2
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(109, 129, 121)
  doc.text(
    `${related.appointments.length} turnos · ${related.consultations.length} consultas · ${related.treatmentPlans.length} tratamientos · ${related.findings.length} piezas con registro`,
    PDF_MARGIN,
    y,
  )
  y += 9

  y = sectionTitle(doc, 'Odontograma', y, 85)
  y = drawOdontogram(doc, related.findings, y)

  if (related.findings.length) {
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Pieza', 'Estado', 'Condición', 'Notas', 'Actualizado']],
        body: related.findings.map((finding) => [
          String(finding.tooth_number),
          TOOTH_STATUS_LABEL[finding.status],
          finding.condition || '',
          finding.notes || '',
          formatDate(finding.event_date),
        ]),
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 22 },
          2: { cellWidth: 42 },
          4: { cellWidth: 25 },
        },
      },
      y,
    )
  } else {
    y = emptyTableMessage(doc, y, 'Sin hallazgos registrados en el odontograma.')
  }

  y = sectionTitle(doc, 'Historial del odontograma', y)
  if (related.toothEvents.length) {
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Fecha', 'Pieza', 'Estado', 'Condición', 'Notas']],
        body: related.toothEvents.map((event) => [
          formatDate(event.event_date),
          String(event.tooth_number),
          TOOTH_STATUS_LABEL[event.status],
          event.condition || '',
          event.notes || '',
        ]),
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 14 },
          2: { cellWidth: 22 },
          3: { cellWidth: 42 },
        },
      },
      y,
    )
  } else {
    y = emptyTableMessage(doc, y, 'Sin cambios históricos registrados.')
  }

  y = sectionTitle(doc, 'Consultas y evoluciones', y)
  if (related.consultations.length) {
    const teethByConsultation = new Map<string, number[]>()
    for (const event of related.toothEvents) {
      if (!event.consultation_id) continue
      const teeth = teethByConsultation.get(event.consultation_id) ?? []
      if (!teeth.includes(event.tooth_number)) teeth.push(event.tooth_number)
      teethByConsultation.set(event.consultation_id, teeth)
    }
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Fecha', 'Motivo', 'Procedimiento', 'Diagnóstico', 'Próximo paso', 'Piezas', 'Notas']],
        body: related.consultations.map((consultation) => [
          formatDate(consultation.consultation_date),
          consultation.reason,
          consultation.procedure || '',
          consultation.diagnosis || '',
          consultation.next_step || '',
          teethByConsultation.get(consultation.id)?.join(', ') || '',
          consultation.notes || '',
        ]),
        columnStyles: {
          0: { cellWidth: 21 },
          1: { cellWidth: 32 },
          2: { cellWidth: 32 },
          3: { cellWidth: 32 },
          4: { cellWidth: 28 },
          5: { cellWidth: 15 },
        },
      },
      y,
    )
  } else {
    y = emptyTableMessage(doc, y, 'Sin consultas registradas.')
  }

  y = sectionTitle(doc, 'Tratamientos', y)
  if (related.treatmentPlans.length) {
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Tratamiento', 'Estado', 'Progreso', 'Próximo paso', 'Notas']],
        body: related.treatmentPlans.map((plan) => [
          plan.name,
          TREATMENT_STATUS_LABEL[plan.status] ?? plan.status,
          `${plan.progress}%`,
          plan.next_step || '',
          plan.notes || '',
        ]),
        columnStyles: {
          1: { cellWidth: 24 },
          2: { cellWidth: 18 },
          3: { cellWidth: 42 },
        },
      },
      y,
    )
  } else {
    y = emptyTableMessage(doc, y, 'Sin tratamientos registrados.')
  }

  y = sectionTitle(doc, 'Turnos', y)
  if (related.appointments.length) {
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Fecha', 'Hora', 'Motivo', 'Estado', 'Notas']],
        body: related.appointments.map((appointment) => [
          formatDate(appointment.appointment_date),
          formatTime(appointment.start_time),
          appointment.reason,
          APPOINTMENT_STATUS_LABEL[appointment.status] ?? appointment.status,
          appointment.notes || '',
        ]),
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 15 },
          2: { cellWidth: 48 },
          3: { cellWidth: 25 },
        },
      },
      y,
    )
  } else {
    y = emptyTableMessage(doc, y, 'Sin turnos registrados.')
  }

  y = sectionTitle(doc, 'Documentos', y)
  if (related.documents.length) {
    y = drawTable(
      doc,
      autoTable,
      {
        ...tableOptions(),
        startY: y,
        head: [['Archivo', 'Fecha', 'Tipo', 'Tamaño']],
        body: related.documents.map((document) => [
          document.name,
          formatDate(document.created_at),
          document.mime_type || '',
          formatBytes(document.size_bytes),
        ]),
        columnStyles: {
          1: { cellWidth: 25 },
          3: { cellWidth: 20 },
        },
      },
      y,
    )
  } else {
    emptyTableMessage(doc, y, 'Sin documentos adjuntos.')
  }
}

function addCoverPage(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  data: WorkspaceData,
  exportedAt: string,
) {
  doc.setFillColor(39, 125, 110)
  doc.rect(0, 0, PDF_WIDTH, 50, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(255, 255, 255)
  doc.text('Molar', PDF_MARGIN, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Exportación de historias clínicas', PDF_MARGIN, 31)

  doc.setTextColor(31, 43, 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(data.practice.name, PDF_MARGIN, 68)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(109, 129, 121)
  doc.text(`Exportado el ${exportedAt}`, PDF_MARGIN, 77)
  doc.text(`Pacientes incluidos: ${data.patients.length}`, PDF_MARGIN, 84)

  const patients = sortedPatients(data.patients)
  drawTable(
    doc,
    autoTable,
    {
      ...tableOptions(),
      startY: 96,
      head: [['Paciente', 'Teléfono', 'Última consulta']],
      body: patients.map((patient) => {
        const lastConsultation = data.consultations.find(
          (consultation) => consultation.patient_id === patient.id,
        )
        return [
          fullName(patient),
          patient.phone || '',
          lastConsultation ? formatDate(lastConsultation.consultation_date) : '',
        ]
      }),
      columnStyles: {
        1: { cellWidth: 40 },
        2: { cellWidth: 35 },
      },
    },
    96,
  )
}

function pdfFilename(data: WorkspaceData, patient: Patient | null) {
  const practice = slugify(data.practice.name) || 'consultorio'
  if (patient) {
    return `molar-${practice}-${slugify(fullName(patient))}-${todayIso()}.pdf`
  }
  return `molar-${practice}-historias-${todayIso()}.pdf`
}

export async function exportPatientPdf(data: WorkspaceData, patient: Patient) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const exportedAt = formatDate(todayIso())
  doc.setProperties({
    title: `Historia clínica - ${fullName(patient)}`,
    subject: `Historia clínica de ${data.practice.name}`,
    author: data.practice.name,
    creator: 'Molar',
  })
  addPatientPdf(doc, autoTable, data, patient)
  addFooter(doc, exportedAt)
  downloadBlob(doc.output('blob'), pdfFilename(data, patient))
}

export async function exportAllPatientsPdf(data: WorkspaceData) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const exportedAt = formatDate(todayIso())
  doc.setProperties({
    title: `Historias clínicas - ${data.practice.name}`,
    subject: `Exportación de historias clínicas de ${data.practice.name}`,
    author: data.practice.name,
    creator: 'Molar',
  })
  addCoverPage(doc, autoTable, data, exportedAt)
  for (const patient of sortedPatients(data.patients)) {
    doc.addPage()
    addPatientPdf(doc, autoTable, data, patient)
  }
  addFooter(doc, exportedAt)
  downloadBlob(doc.output('blob'), pdfFilename(data, null))
}
