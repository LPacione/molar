-- Molar · migración multiusuario
--
-- Esta migración es segura para un proyecto Supabase nuevo. No elimina tablas
-- ni datos: usa CREATE TABLE IF NOT EXISTS y sólo agrega políticas/estructuras
-- faltantes. Si ya tenías tablas clínicas propias, revisá los nombres antes de
-- ejecutarla y adaptá la migración a tu esquema.
--
-- Ejecutar en el SQL Editor de Supabase o con `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Espacio de trabajo
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Mi consultorio',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practices_owner_id_idx on public.practices (owner_id);
create unique index if not exists practices_owner_id_unique on public.practices (owner_id);

create table if not exists public.practice_settings (
  practice_id uuid primary key references public.practices (id) on delete cascade,
  default_duration_minutes integer not null default 45
    check (default_duration_minutes between 5 and 480),
  workday_start time not null default '08:00',
  workday_end time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (workday_end > workday_start)
);

-- ---------------------------------------------------------------------------
-- Datos clínicos
-- ---------------------------------------------------------------------------

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  birth_date date,
  allergies text,
  medical_history text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, practice_id)
);

create index if not exists patients_practice_id_idx on public.patients (practice_id);
create index if not exists patients_name_idx on public.patients (practice_id, last_name, first_name);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  appointment_date date not null,
  start_time time not null,
  duration_minutes integer not null default 45
    check (duration_minutes between 5 and 480),
  reason text not null,
  status text not null default 'pendiente'
    check (status in ('confirmado', 'pendiente', 'en_atencion', 'atendido', 'cancelado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists appointments_practice_date_idx
  on public.appointments (practice_id, appointment_date, start_time);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  consultation_date date not null default current_date,
  reason text not null,
  notes text,
  diagnosis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consultations_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists consultations_practice_patient_idx
  on public.consultations (practice_id, patient_id, consultation_date desc);

create table if not exists public.odontogram_findings (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  tooth_number smallint not null check (tooth_number between 11 and 48),
  status text not null default 'hallazgo'
    check (status in ('sano', 'hallazgo', 'tratado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, tooth_number),
  constraint odontogram_findings_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists odontogram_findings_practice_patient_idx
  on public.odontogram_findings (practice_id, patient_id);

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  name text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_curso', 'completado')),
  progress smallint not null default 0 check (progress between 0 and 100),
  next_step text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint treatment_plans_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists treatment_plans_practice_patient_idx
  on public.treatment_plans (practice_id, patient_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists documents_practice_patient_idx
  on public.documents (practice_id, patient_id);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists schedule_blocks_practice_date_idx
  on public.schedule_blocks (practice_id, block_date);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists practices_set_updated_at on public.practices;
create trigger practices_set_updated_at before update on public.practices
  for each row execute function public.set_updated_at();

drop trigger if exists practice_settings_set_updated_at on public.practice_settings;
create trigger practice_settings_set_updated_at before update on public.practice_settings
  for each row execute function public.set_updated_at();

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

drop trigger if exists consultations_set_updated_at on public.consultations;
create trigger consultations_set_updated_at before update on public.consultations
  for each row execute function public.set_updated_at();

drop trigger if exists odontogram_findings_set_updated_at on public.odontogram_findings;
create trigger odontogram_findings_set_updated_at before update on public.odontogram_findings
  for each row execute function public.set_updated_at();

drop trigger if exists treatment_plans_set_updated_at on public.treatment_plans;
create trigger treatment_plans_set_updated_at before update on public.treatment_plans
  for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists schedule_blocks_set_updated_at on public.schedule_blocks;
create trigger schedule_blocks_set_updated_at before update on public.schedule_blocks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers de autorización
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER evita recursión de RLS al consultar practices desde las
-- políticas de las tablas clínicas. Sólo devuelve un booleano y no acepta
-- identidad del cliente: usa auth.uid().
create or replace function public.is_practice_owner(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practices p
    where p.id = target_practice_id
      and p.owner_id = auth.uid()
  );
$$;

revoke all on function public.is_practice_owner(uuid) from public;
grant execute on function public.is_practice_owner(uuid) to authenticated;

-- Crea perfil, consultorio y configuración para el usuario autenticado si
-- faltan. Es idempotente y usa exclusivamente auth.uid() y auth.users.
create or replace function public.ensure_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_full_name text;
  v_practice_name text;
  v_practice_id uuid;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  select
    u.email,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    ),
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'practice_name'), ''),
      'Consultorio de ' || coalesce(
        nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
        split_part(coalesce(u.email, ''), '@', 1)
      )
    )
  into v_email, v_full_name, v_practice_name
  from auth.users u
  where u.id = v_user_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;

  insert into public.profiles (id, full_name, email)
  values (v_user_id, coalesce(v_full_name, 'Profesional'), v_email)
  on conflict (id) do nothing;

  select p.id into v_practice_id
  from public.practices p
  where p.owner_id = v_user_id
  order by p.created_at asc
  limit 1;

  if v_practice_id is null then
    insert into public.practices (owner_id, name)
    values (v_user_id, coalesce(nullif(v_practice_name, ''), 'Mi consultorio'))
    returning id into v_practice_id;
  end if;

  insert into public.practice_settings (practice_id)
  values (v_practice_id)
  on conflict (practice_id) do nothing;

  return v_practice_id;
end;
$$;

revoke all on function public.ensure_workspace() from public;
grant execute on function public.ensure_workspace() to authenticated;

-- Trigger de alta: crea el espacio privado al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_full_name text;
  v_practice_name text;
  v_practice_id uuid;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_practice_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'practice_name'), ''),
    'Consultorio de ' || coalesce(v_full_name, 'Molar')
  );

  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(v_full_name, 'Profesional'), new.email)
  on conflict (id) do nothing;

  insert into public.practices (owner_id, name)
  values (new.id, coalesce(nullif(v_practice_name, ''), 'Mi consultorio'))
  returning id into v_practice_id;

  insert into public.practice_settings (practice_id)
  values (v_practice_id)
  on conflict (practice_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.set_updated_at() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Retrocompatibilidad: crea perfiles/consultorios para usuarios existentes
-- sin borrar ni sobrescribir datos. No copia datos clínicos.
insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  u.email
from auth.users u
on conflict (id) do nothing;

insert into public.practices (owner_id, name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'practice_name'), ''),
    'Consultorio de ' || coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )
  )
from auth.users u
where not exists (
  select 1 from public.practices p where p.owner_id = u.id
);

insert into public.practice_settings (practice_id)
select p.id
from public.practices p
where not exists (
  select 1 from public.practice_settings s where s.practice_id = p.id
)
on conflict (practice_id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.practices enable row level security;
alter table public.practice_settings enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.consultations enable row level security;
alter table public.odontogram_findings enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.documents enable row level security;
alter table public.schedule_blocks enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- practices
drop policy if exists "practices_select_own" on public.practices;
create policy "practices_select_own" on public.practices
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "practices_insert_own" on public.practices;
create policy "practices_insert_own" on public.practices
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "practices_update_own" on public.practices;
create policy "practices_update_own" on public.practices
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "practices_delete_own" on public.practices;
create policy "practices_delete_own" on public.practices
  for delete to authenticated
  using (owner_id = auth.uid());

-- practice_settings
drop policy if exists "practice_settings_select_own" on public.practice_settings;
create policy "practice_settings_select_own" on public.practice_settings
  for select to authenticated
  using (public.is_practice_owner(practice_id));

drop policy if exists "practice_settings_insert_own" on public.practice_settings;
create policy "practice_settings_insert_own" on public.practice_settings
  for insert to authenticated
  with check (public.is_practice_owner(practice_id));

drop policy if exists "practice_settings_update_own" on public.practice_settings;
create policy "practice_settings_update_own" on public.practice_settings
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "practice_settings_delete_own" on public.practice_settings;
create policy "practice_settings_delete_own" on public.practice_settings
  for delete to authenticated
  using (public.is_practice_owner(practice_id));

-- Políticas clínicas: SELECT/INSERT/UPDATE/DELETE sólo dentro del consultorio
-- propio. El WITH CHECK impide mover un registro a un practice_id ajeno.
drop policy if exists "patients_select_own" on public.patients;
create policy "patients_select_own" on public.patients
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "patients_insert_own" on public.patients;
create policy "patients_insert_own" on public.patients
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "patients_update_own" on public.patients;
create policy "patients_update_own" on public.patients
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "patients_delete_own" on public.patients;
create policy "patients_delete_own" on public.patients
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "appointments_select_own" on public.appointments;
create policy "appointments_select_own" on public.appointments
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "appointments_insert_own" on public.appointments;
create policy "appointments_insert_own" on public.appointments
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "appointments_update_own" on public.appointments;
create policy "appointments_update_own" on public.appointments
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "appointments_delete_own" on public.appointments;
create policy "appointments_delete_own" on public.appointments
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "consultations_select_own" on public.consultations;
create policy "consultations_select_own" on public.consultations
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "consultations_insert_own" on public.consultations;
create policy "consultations_insert_own" on public.consultations
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "consultations_update_own" on public.consultations;
create policy "consultations_update_own" on public.consultations
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "consultations_delete_own" on public.consultations;
create policy "consultations_delete_own" on public.consultations
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "odontogram_findings_select_own" on public.odontogram_findings;
create policy "odontogram_findings_select_own" on public.odontogram_findings
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "odontogram_findings_insert_own" on public.odontogram_findings;
create policy "odontogram_findings_insert_own" on public.odontogram_findings
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "odontogram_findings_update_own" on public.odontogram_findings;
create policy "odontogram_findings_update_own" on public.odontogram_findings
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "odontogram_findings_delete_own" on public.odontogram_findings;
create policy "odontogram_findings_delete_own" on public.odontogram_findings
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "treatment_plans_select_own" on public.treatment_plans;
create policy "treatment_plans_select_own" on public.treatment_plans
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "treatment_plans_insert_own" on public.treatment_plans;
create policy "treatment_plans_insert_own" on public.treatment_plans
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "treatment_plans_update_own" on public.treatment_plans;
create policy "treatment_plans_update_own" on public.treatment_plans
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "treatment_plans_delete_own" on public.treatment_plans;
create policy "treatment_plans_delete_own" on public.treatment_plans
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "schedule_blocks_select_own" on public.schedule_blocks;
create policy "schedule_blocks_select_own" on public.schedule_blocks
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "schedule_blocks_insert_own" on public.schedule_blocks;
create policy "schedule_blocks_insert_own" on public.schedule_blocks
  for insert to authenticated with check (public.is_practice_owner(practice_id));

drop policy if exists "schedule_blocks_update_own" on public.schedule_blocks;
create policy "schedule_blocks_update_own" on public.schedule_blocks
  for update to authenticated
  using (public.is_practice_owner(practice_id))
  with check (public.is_practice_owner(practice_id));

drop policy if exists "schedule_blocks_delete_own" on public.schedule_blocks;
create policy "schedule_blocks_delete_own" on public.schedule_blocks
  for delete to authenticated using (public.is_practice_owner(practice_id));

-- Permisos de tabla. RLS sigue siendo la barrera efectiva.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.practices,
  public.practice_settings,
  public.patients,
  public.appointments,
  public.consultations,
  public.odontogram_findings,
  public.treatment_plans,
  public.documents,
  public.schedule_blocks
to authenticated;

revoke all on
  public.profiles,
  public.practices,
  public.practice_settings,
  public.patients,
  public.appointments,
  public.consultations,
  public.odontogram_findings,
  public.treatment_plans,
  public.documents,
  public.schedule_blocks
from anon;

-- ---------------------------------------------------------------------------
-- Storage privado de documentos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta del path es el practice_id:
-- documents/<practice_id>/<patient_id>/<archivo>
-- `objects.name` debe ir calificado: dentro de la subconsulta, `name` sin
-- calificar resolvería a public.practices.name y la política nunca coincidiría.
drop policy if exists "documents_storage_select_own" on storage.objects;
create policy "documents_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.practices p
      where p.owner_id = auth.uid()
        and p.id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "documents_storage_insert_own" on storage.objects;
create policy "documents_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.practices p
      where p.owner_id = auth.uid()
        and p.id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "documents_storage_update_own" on storage.objects;
create policy "documents_storage_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.practices p
      where p.owner_id = auth.uid()
        and p.id::text = (storage.foldername(objects.name))[1]
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.practices p
      where p.owner_id = auth.uid()
        and p.id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "documents_storage_delete_own" on storage.objects;
create policy "documents_storage_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.practices p
      where p.owner_id = auth.uid()
        and p.id::text = (storage.foldername(objects.name))[1]
    )
  );
