-- Molar — historia clínica por turno y odontograma histórico
--
-- Esta migración es aditiva. No elimina la tabla odontogram_findings: sus
-- datos se copian a tooth_events para conservar el estado actual como primer
-- evento del historial.

-- ---------------------------------------------------------------------------
-- Evolución clínica vinculada al turno
-- ---------------------------------------------------------------------------

alter table public.consultations
  add column if not exists appointment_id uuid references public.appointments (id) on delete set null,
  add column if not exists procedure text,
  add column if not exists next_step text;

create unique index if not exists consultations_appointment_unique
  on public.consultations (appointment_id)
  where appointment_id is not null;

create index if not exists consultations_appointment_idx
  on public.consultations (appointment_id);

-- ---------------------------------------------------------------------------
-- Eventos históricos del odontograma
-- ---------------------------------------------------------------------------

create table if not exists public.tooth_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null,
  tooth_number smallint not null check (tooth_number between 11 and 48),
  appointment_id uuid references public.appointments (id) on delete set null,
  consultation_id uuid references public.consultations (id) on delete set null,
  event_date date not null default current_date,
  status text not null default 'hallazgo'
    check (status in ('sano', 'hallazgo', 'tratado')),
  condition text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint tooth_events_patient_same_practice
    foreign key (patient_id, practice_id)
    references public.patients (id, practice_id)
    on delete cascade
);

create index if not exists tooth_events_practice_patient_idx
  on public.tooth_events (practice_id, patient_id, tooth_number, event_date desc, created_at desc);

create index if not exists tooth_events_consultation_idx
  on public.tooth_events (consultation_id);

create index if not exists tooth_events_appointment_idx
  on public.tooth_events (appointment_id);

alter table public.tooth_events enable row level security;

drop policy if exists "tooth_events_select_own" on public.tooth_events;
create policy "tooth_events_select_own" on public.tooth_events
  for select to authenticated using (public.is_practice_owner(practice_id));

drop policy if exists "tooth_events_insert_own" on public.tooth_events;
create policy "tooth_events_insert_own" on public.tooth_events
  for insert to authenticated with check (public.is_practice_owner(practice_id));

grant select, insert on public.tooth_events to authenticated;
revoke all on public.tooth_events from anon;

-- Los hallazgos existentes pasan a ser el primer evento conocido de cada
-- pieza. Se usa updated_at como fecha aproximada porque era el único dato
-- temporal disponible en el esquema anterior.
insert into public.tooth_events (
  practice_id,
  patient_id,
  tooth_number,
  event_date,
  status,
  notes,
  created_at
)
select
  f.practice_id,
  f.patient_id,
  f.tooth_number,
  coalesce(f.updated_at::date, f.created_at::date, current_date),
  f.status,
  f.notes,
  f.created_at
from public.odontogram_findings f
where not exists (
  select 1
  from public.tooth_events e
  where e.practice_id = f.practice_id
    and e.patient_id = f.patient_id
    and e.tooth_number = f.tooth_number
);
