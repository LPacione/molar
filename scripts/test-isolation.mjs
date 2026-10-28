/**
 * Prueba de aislamiento entre dos odontólogos.
 *
 * Uso:
 *   node scripts/test-isolation.mjs
 *
 * Variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 *   NEXT_PUBLIC_SITE_URL (opcional)
 *   SUPABASE_SERVICE_ROLE_KEY (opcional, recomendado para crear/borrar usuarios)
 *
 * Si no hay service role, el proyecto debe tener deshabilitada la confirmación
 * por email para que signUp devuelva una sesión. De lo contrario, creá dos
 * usuarios de prueba manualmente y pasá TEST_USER_A_EMAIL/PASSWORD y
 * TEST_USER_B_EMAIL/PASSWORD.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anonKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  process.exit(1)
}

const suffix = Date.now().toString(36)
const password = `MolarTest-${suffix}-9`
const accountA =
  process.env.TEST_USER_A_EMAIL ?? `rls-a-${suffix}@example.com`
const accountB =
  process.env.TEST_USER_B_EMAIL ?? `rls-b-${suffix}@example.com`
const passwordA = process.env.TEST_USER_A_PASSWORD ?? password
const passwordB = process.env.TEST_USER_B_PASSWORD ?? password

const admin = serviceKey
  ? createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null

let createdA = false
let createdB = false
let failures = 0

function check(condition, label, detail = '') {
  if (condition) {
    console.log(`  OK  ${label}`)
  } else {
    failures += 1
    console.error(`FAIL  ${label}${detail ? ` · ${detail}` : ''}`)
  }
}

async function provision(email, shouldCreate) {
  if (shouldCreate && admin) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Odontólogo de prueba' },
    })
    if (error && !error.message.toLowerCase().includes('already registered')) {
      throw new Error(`No se pudo crear el usuario ${email}: ${error.message}`)
    }
    return
  }

  if (shouldCreate) {
    const temp = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await temp.auth.signUp({
      email,
      password,
      options: { data: { full_name: 'Odontólogo de prueba' } },
    })
    if (error) throw new Error(`No se pudo registrar ${email}: ${error.message}`)
    if (!data.session) {
      throw new Error(
        'El registro no devolvió sesión. Configurá SUPABASE_SERVICE_ROLE_KEY para la prueba o deshabilitá temporalmente la confirmación de email.',
      )
    }
  }
}

async function signIn(email, pass) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: pass,
  })
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}: ${error.message}`)
  return { client, user: data.user }
}

async function ensurePractice(client) {
  await client.rpc('ensure_workspace')
  const { data, error } = await client
    .from('practices')
    .select('id, name, owner_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer el consultorio: ${error.message}`)
  if (!data) throw new Error('El usuario no tiene consultorio. ¿Aplicaste la migración?')
  return data
}

async function main() {
  console.log('Molar · prueba de aislamiento RLS\n')

  const hasManualUsers = Boolean(
    process.env.TEST_USER_A_EMAIL && process.env.TEST_USER_B_EMAIL,
  )

  try {
    if (!hasManualUsers) {
      console.log('Creando usuarios de prueba…')
      await provision(accountA, true)
      createdA = true
      await provision(accountB, true)
      createdB = true
    }

    const { client: clientA, user: userA } = await signIn(accountA, passwordA)
    const { client: clientB, user: userB } = await signIn(accountB, passwordB)

    const practiceA = await ensurePractice(clientA)
    const practiceB = await ensurePractice(clientB)

    check(practiceA.id !== practiceB.id, 'Cada usuario tiene un consultorio distinto')
    check(practiceA.owner_id === userA.id, 'El consultorio A pertenece al usuario A')
    check(practiceB.owner_id === userB.id, 'El consultorio B pertenece al usuario B')

    console.log('\nCreando datos de cada consultorio…')
    const patientA = await clientA
      .from('patients')
      .insert({
        practice_id: practiceA.id,
        first_name: 'Paciente',
        last_name: `Privado A ${suffix}`,
        phone: '000000001',
      })
      .select('id')
      .single()

    const patientB = await clientB
      .from('patients')
      .insert({
        practice_id: practiceB.id,
        first_name: 'Paciente',
        last_name: `Privado B ${suffix}`,
        phone: '000000002',
      })
      .select('id')
      .single()

    check(!patientA.error && Boolean(patientA.data), 'Usuario A crea un paciente en su consultorio')
    check(!patientB.error && Boolean(patientB.data), 'Usuario B crea un paciente en su consultorio')

    if (!patientA.data || !patientB.data) throw new Error('No se pudieron crear los pacientes de prueba')

    console.log('\nIntentos de acceso cruzado…')

    const crossSelect = await clientB
      .from('patients')
      .select('id, first_name')
      .eq('id', patientA.data.id)
    check(
      !crossSelect.error && (crossSelect.data ?? []).length === 0,
      'B no puede leer el paciente de A',
      crossSelect.error?.message,
    )

    const crossUpdate = await clientB
      .from('patients')
      .update({ first_name: 'HACKEADO' })
      .eq('id', patientA.data.id)
      .select('id')
    check(
      !crossUpdate.error && (crossUpdate.data ?? []).length === 0,
      'B no puede modificar el paciente de A',
      crossUpdate.error?.message,
    )

    const crossDelete = await clientB
      .from('patients')
      .delete()
      .eq('id', patientA.data.id)
      .select('id')
    check(
      !crossDelete.error && (crossDelete.data ?? []).length === 0,
      'B no puede eliminar el paciente de A',
      crossDelete.error?.message,
    )

    const crossPracticeInsert = await clientB.from('patients').insert({
      practice_id: practiceA.id,
      first_name: 'Intruso',
      last_name: 'Prueba',
    })
    check(Boolean(crossPracticeInsert.error), 'B no puede insertar en el consultorio de A')

    const crossAppointment = await clientB.from('appointments').insert({
      practice_id: practiceB.id,
      patient_id: patientA.data.id,
      appointment_date: new Date().toISOString().slice(0, 10),
      start_time: '09:00',
      duration_minutes: 30,
      reason: 'Intento cruzado',
      status: 'pendiente',
    })
    check(
      Boolean(crossAppointment.error),
      'B no puede vincular un turno a un paciente de A',
      crossAppointment.error?.message,
    )

    const crossConsultation = await clientB.from('consultations').insert({
      practice_id: practiceA.id,
      patient_id: patientA.data.id,
      consultation_date: new Date().toISOString().slice(0, 10),
      reason: 'Intento cruzado',
    })
    check(Boolean(crossConsultation.error), 'B no puede crear consultas en el consultorio de A')

    const crossTreatment = await clientB.from('treatment_plans').insert({
      practice_id: practiceA.id,
      patient_id: patientA.data.id,
      name: 'Intento cruzado',
      status: 'pendiente',
      progress: 0,
    })
    check(Boolean(crossTreatment.error), 'B no puede crear tratamientos en el consultorio de A')

    console.log('\nStorage…')
    const crossUpload = await clientB.storage
      .from('documents')
      .upload(
        `${practiceA.id}/${patientA.data.id}/intruso-${suffix}.pdf`,
        new Blob(['%PDF-1.4 intruso']),
        { contentType: 'application/pdf' },
      )
    check(Boolean(crossUpload.error), 'B no puede subir archivos al consultorio de A')

    const ownUpload = await clientA.storage
      .from('documents')
      .upload(
        `${practiceA.id}/${patientA.data.id}/propio-${suffix}.pdf`,
        new Blob(['%PDF-1.4 propio']),
        { contentType: 'application/pdf', upsert: true },
      )
    check(!ownUpload.error, 'A puede subir un archivo a su propio consultorio', ownUpload.error?.message)

    console.log('\nLimpieza…')
    await clientA.from('patients').delete().eq('id', patientA.data.id)
    await clientB.from('patients').delete().eq('id', patientB.data.id)
    if (!ownUpload.error) {
      await clientA.storage
        .from('documents')
        .remove([`${practiceA.id}/${patientA.data.id}/propio-${suffix}.pdf`])
    }

    if (failures === 0) {
      console.log('\nResultado: todas las pruebas de aislamiento pasaron.')
    } else {
      console.error(`\nResultado: ${failures} prueba(s) fallaron.`)
      process.exitCode = 1
    }
  } finally {
    if (admin) {
      if (createdA) {
        const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const user = data?.users.find((item) => item.email === accountA)
        if (user) await admin.auth.admin.deleteUser(user.id)
      }
      if (createdB) {
        const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const user = data?.users.find((item) => item.email === accountB)
        if (user) await admin.auth.admin.deleteUser(user.id)
      }
      console.log('Usuarios de prueba eliminados.')
    }
  }
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`)
  process.exitCode = 1
})
