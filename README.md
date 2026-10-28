# Molar · Gestión odontológica multiusuario

Molar conserva la interfaz y el modo demo existentes, y agrega un modo autenticado
real con Supabase Auth, PostgreSQL, Row Level Security y Storage. Cada odontólogo
obtiene su propio perfil, consultorio y datos clínicos aislados.

## Modos de la aplicación

- `/` · panel privado autenticado. Requiere sesión válida.
- `/login`, `/register`, `/forgot-password`, `/reset-password` · autenticación.
- `/demo` · demo estático y aislado con datos ficticios. No usa Supabase, no
  persiste datos reales y está claramente identificado como demostración.

Si faltan las variables de Supabase, las pantallas de autenticación muestran un
aviso de configuración pendiente y no simulan accesos. El panel privado redirige
a `/login`. El modo demo sigue disponible sin Supabase.

## Instalación

```bash
pnpm install
pnpm dev
```

Verificación local:

```bash
pnpm typecheck
pnpm build
```

## Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
# o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Producción:

```env
NEXT_PUBLIC_SITE_URL=https://tu-dominio.com
```

`NEXT_PUBLIC_SITE_URL` también se usa para armar el enlace público
`/turno/[token]` que se incluye en el mensaje de WhatsApp. En producción debe
apuntar al dominio real; si queda en `localhost`, el paciente no podrá abrir el
calendario desde su teléfono.

La `service_role` **no** se usa en la aplicación. El script de pruebas puede leer
`SUPABASE_SERVICE_ROLE_KEY` desde tu terminal, pero nunca debe exponerse con el
prefijo `NEXT_PUBLIC_` ni incluirse en el repositorio.

## Migración de base de datos

Archivo:

```
supabase/migrations/20261027000100_multiuser.sql
supabase/migrations/20261027000200_clinical_history.sql
supabase/migrations/20261027000300_public_appointment_links.sql
supabase/migrations/20261027000400_no_show_and_cancellation_policy.sql
```

La segunda migración agrega la evolución clínica vinculada al turno y el
historial de eventos del odontograma (`tooth_events`). Es aditiva y copia los
hallazgos existentes como primer evento de cada pieza. Hay que aplicarla después
de la migración multiusuario.

La tercera migración agrega `appointments.public_token` y la función
`get_public_appointment`, usada por la página pública `/turno/[token]` para que
el paciente agregue el turno a Google Calendar o descargue un archivo `.ics`.
La función sólo devuelve fecha, hora, motivo y datos mínimos del consultorio;
no expone historia clínica. Aplicarla después de las dos anteriores.

La cuarta migración agrega el estado `no_asistio` para los turnos y el campo
`practice_settings.cancellation_policy`. La política se configura en Ajustes y
se incluye en el mensaje de WhatsApp únicamente cuando es el primer turno del
paciente con el odontólogo. Aplicarla después de las tres anteriores.

La migración multiusuario incluye:

- `profiles`, `practices`, `practice_settings`.
- `patients`, `appointments`, `consultations`, `odontogram_findings`,
  `treatment_plans`, `documents`, `schedule_blocks`.
- Claves foráneas compuestas `(patient_id, practice_id)` para impedir que un
  turno, consulta, hallazgo, tratamiento o documento se vincule a un paciente de
  otro consultorio.
- RLS en todas las tablas privadas, con políticas `SELECT`, `INSERT`, `UPDATE` y
  `DELETE` basadas en `auth.uid()` y en el propietario del consultorio.
- Trigger de alta que crea perfil + consultorio + configuración inicial.
- Función `ensure_workspace()` idempotente para cuentas existentes.
- Bucket privado `documents` con políticas de Storage por carpeta de consultorio.
- Retrocompatibilidad para usuarios existentes sin perfil/consultorio. No borra
  ni reinicializa datos.

### Ejecutar

Opción A, Dashboard de Supabase:

1. Abrí tu proyecto.
2. SQL Editor → New query.
3. Pegá el contenido de la migración y ejecutá.

Opción B, Supabase CLI:

```bash
supabase init          # sólo si el proyecto todavía no tiene supabase/config.toml
supabase link --project-ref TU_PROJECT_REF
supabase db push
```

Después de aplicar la migración, verificá en Table Editor que RLS esté activo en
todas las tablas `public.*` clínicas y que el bucket `documents` sea privado.

> Si ya tenés tablas clínicas con otros nombres o datos, revisá y adaptá la
> migración antes de ejecutarla. No la corras a ciegas sobre un esquema en
> producción.

## Configuración de Supabase Auth

En Authentication → URL Configuration:

- **Site URL**
  - Desarrollo: `http://localhost:3000`
  - Producción: `https://tu-dominio.com`
- **Redirect URLs** (agregar todas las variantes)
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirm`
  - `http://localhost:3000/reset-password`
  - `https://tu-dominio.com/auth/callback`
  - `https://tu-dominio.com/auth/confirm`
  - `https://tu-dominio.com/reset-password`

En Authentication → Sign In / Providers:

- En **Email**, habilitá **Enable email provider**.
- En **User Signups**, se recomienda habilitar **Confirm email** en producción.
  Para pruebas locales podés desactivarlo o confirmar los usuarios manualmente.
- Deshabilitá ingresos anónimos.
- Configurá una contraseña mínima de 8 caracteres.
- Dejá desactivado **Require current password when updating** para que funcione
  el flujo de recuperación de contraseña.

### Registro cerrado en producción

Para que nadie pueda crear una cuenta por su cuenta:

- En **Authentication → Sign In / Providers → User Signups**, desactivá
  **Allow new users to sign up**.
- Creá cada profesional desde **Authentication → Users → Add user**, con
  **Auto Confirm User**.
- O usá **Invite user** una vez configurado SMTP.
- Ocultar `/register` sólo mejora la experiencia; la protección real es el
  ajuste de Supabase. No alcanza con proteger la ruta en Next.js porque la clave
  pública permite llamar a la API de Auth.

### Plantillas de email recomendadas

Para que la verificación y la recuperación funcionen aunque el enlace se abra en
otro navegador, usá `TokenHash` en lugar de depender del verificador PKCE:

Confirmación de registro:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/">
  Confirmar mi cuenta
</a>
```

Recuperación de contraseña:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Restablecer mi contraseña
</a>
```

Con las plantillas por defecto, `/auth/callback` también funciona para enlaces
abiertos en el mismo navegador donde se solicitó el acceso.

Después del registro:

- Si la confirmación de email está activa, se muestra una pantalla indicando que
  hay que revisar el correo. El panel privado no queda accesible hasta confirmar.
- Si está desactivada, Supabase devuelve sesión y se redirige al panel.

## Calendario desde WhatsApp

Cada turno tiene un `public_token` impredecible. El mensaje de WhatsApp incluye
un enlace `/turno/[token]` donde el paciente ve fecha, hora, profesional, motivo
y consultorio, sin datos clínicos ni acceso al panel.

Desde esa página puede:

- **Agregar a Google Calendar** con un enlace directo.
- **Descargar un `.ics`** para Apple Calendar, Outlook u otras apps.

El enlace se genera desde el servidor y usa `NEXT_PUBLIC_SITE_URL`. La página
tiene `robots: noindex` y no muestra historia clínica. Si el turno se cancela o
se marca como no asistido, oculta los botones de calendario.

## Ausencias y política de cancelación

Un turno puede marcarse como **No asistió** desde el dashboard, la agenda o la
ficha del paciente una vez que pasó su horario. Ese estado no pide evolución
clínica y deja de contar como turno pendiente.

- El dashboard muestra las ausencias del mes, la tasa de ausentismo y los
  pacientes con 2 o más ausencias en los últimos 6 meses.
- La ficha del paciente muestra una alerta cuando acumula 2 o más ausencias en
  los últimos 6 meses.
- La política de cancelación se configura en **Ajustes** y se envía en el
  WhatsApp sólo para el primer turno del paciente con el odontólogo.

> WhatsApp `wa.me` no permite botones interactivos nativos. Para botones dentro
> del chat hace falta WhatsApp Business API (Meta/Twilio), con configuración y
> costos adicionales. El enlace público funciona sin esa integración.

## Registro de evolución y odontograma

**Registrar evolución** abre una pantalla completa, no un pop-up. Ahí se ve el
odontograma actual del paciente y se pueden marcar las piezas trabajadas en ese
turno. Cada pieza admite estado (`sano`, `hallazgo`, `tratado`), condición y
notas.

Al guardar se crea la consulta, se marcan las piezas en `tooth_events` y el turno
pasa a `atendido`. Los eventos quedan vinculados al `appointment_id`, al
`consultation_id` y a la fecha del turno. El estado actual del odontograma se
calcula con el último evento de cada pieza.

La pestaña **Odontograma** de la ficha sigue sirviendo para diagnósticos
iniciales, correcciones o registros fuera de un turno.

## Exportación de datos

Cada paciente tiene un botón **Exportar** en su ficha. La página **Pacientes**
tiene **Exportar todo** para descargar el consultorio completo. En ambos casos
se puede elegir CSV o PDF.

- **CSV** genera un archivo `.zip` con un CSV por tabla: consultorio,
  configuración, pacientes, turnos, consultas, odontograma actual, historial del
  odontograma, tratamientos, documentos y bloqueos de agenda. Los CSV usan UTF-8
  con BOM, separador coma y fechas `AAAA-MM-DD`, para poder importarlos en otra
  base de datos. También incluye `manifest.json`, `LEEME.txt` y los archivos
  adjuntos disponibles en `documentos/`.
- **PDF** genera una historia clínica con ficha técnica, mapa odontológico,
  estado actual e historial del odontograma, consultas, tratamientos, turnos y
  documentos. En la exportación completa se agrega una portada y cada paciente
  empieza en una página nueva.

Los documentos se incluyen en el ZIP sólo si su enlace firmado sigue vigente. No
se exportan los `public_token` de los turnos. La generación es local en el
navegador: con muchos pacientes o archivos puede tardar unos segundos.

## Flujo de datos

- El servidor obtiene la sesión con `supabase.auth.getUser()` en cada carga de `/`.
- `proxy.ts` renueva cookies y redirige a `/login` cuando no hay sesión.
- El `practice_id` siempre se deriva en el servidor a partir de
  `practices.owner_id = auth.uid()`. Nunca se acepta desde el navegador como
  autorización.
- `profiles` y `practices` se cargan en servidor. Si faltan, se llama a
  `ensure_workspace()`.
- Los listados, contadores, búsqueda global y agenda sólo consultan el
  consultorio del usuario.
- Los documentos se suben con el cliente de servidor al bucket privado
  `documents`, con path `<practice_id>/<patient_id>/<archivo>`, y se abren con
  URLs firmadas.

## Prueba de aislamiento entre dos odontólogos

Con la migración aplicada y las variables cargadas en la terminal:

```bash
npm run test:rls
```

El script:

1. Crea dos usuarios de prueba (recomendado usar `SUPABASE_SERVICE_ROLE_KEY` para
   confirmarlos automáticamente).
2. Inicia sesión con cada uno usando sólo la clave pública.
3. Crea un paciente en cada consultorio.
4. Verifica que B no pueda leer, actualizar ni eliminar el paciente de A.
5. Verifica que B no pueda insertar en el consultorio de A ni vincular turnos,
   consultas o tratamientos a pacientes ajenos.
6. Verifica que B no pueda subir archivos a la carpeta de Storage de A.
7. Limpia los datos y usuarios de prueba.

Si no usás service role, deshabilitá temporalmente la confirmación de email o
precreá dos usuarios y definí `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`,
`TEST_USER_B_EMAIL` y `TEST_USER_B_PASSWORD`.

También podés probar manualmente:

1. Registrá al odontólogo A y creá un paciente.
2. Cerrá sesión, registrá al odontólogo B en otro navegador/incógnito.
3. Verificá que B tenga agenda y pacientes vacíos.
4. Copiá el ID del paciente de A e intentá abrirlo desde la ficha de B. La UI no
   debe encontrarlo.
5. Desde la consola del navegador, usando el cliente público y el token de B,
   intentá `select/update/delete` sobre el ID de A. RLS debe devolver vacío o
   error.

## Qué queda pendiente antes de datos clínicos reales en producción

- Aplicar `20261027000200_clinical_history.sql`,
  `20261027000300_public_appointment_links.sql` y
  `20261027000400_no_show_and_cancellation_policy.sql` en el proyecto real.
- Desactivar **Allow new users to sign up** y crear los usuarios manualmente.
- Configurar `NEXT_PUBLIC_SITE_URL` con el dominio real para que el enlace de
  calendario de WhatsApp funcione.
- Ejecutar la prueba de aislamiento en el proyecto Supabase real y revisar
  Advisors de Supabase (RLS, funciones, Storage).
- Configurar backups/PITR y política de retención de datos clínicos.
- Definir cumplimiento legal y sanitario aplicable (protección de datos de
  salud, consentimiento informado, auditoría de accesos, exportación/borrado).
- Agregar auditoría de accesos y cambios clínicos (tabla de audit log).
- Implementar MFA para profesionales y política de contraseñas más estricta si
  corresponde.
- Analizar antivirus/validación profunda de archivos subidos y límites de
  almacenamiento.
- Configurar dominio, HTTPS, SPF/DKIM/DMARC y plantillas de email de producción.
- Evaluar rate limiting adicional y alertas de seguridad.
- Este MVP tiene un único propietario por consultorio. No incluye invitaciones,
  empleados, múltiples profesionales ni permisos avanzados.
