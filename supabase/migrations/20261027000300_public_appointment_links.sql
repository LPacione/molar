-- Molar — enlaces públicos de turno para agregar al calendario
--
-- Cada turno obtiene un token impredecible. El token permite consultar sólo
-- los datos mínimos del turno mediante una función SECURITY DEFINER, sin
-- exponer la tabla appointments ni datos clínicos.

alter table public.appointments
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists appointments_public_token_unique
  on public.appointments (public_token);

create or replace function public.get_public_appointment(p_token uuid)
returns table (
  appointment_date date,
  start_time time,
  duration_minutes integer,
  reason text,
  status text,
  practice_name text,
  professional_name text,
  patient_first_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.appointment_date,
    a.start_time,
    a.duration_minutes,
    a.reason,
    a.status,
    pr.name,
    coalesce(nullif(prf.full_name, ''), 'Profesional'),
    pt.first_name
  from public.appointments a
  join public.practices pr on pr.id = a.practice_id
  join public.patients pt on pt.id = a.patient_id
  left join public.profiles prf on prf.id = pr.owner_id
  where a.public_token = p_token
  limit 1;
$$;

revoke all on function public.get_public_appointment(uuid) from public;
grant execute on function public.get_public_appointment(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
