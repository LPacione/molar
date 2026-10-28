-- Molar — ausencias y política de cancelación
--
-- Agrega el estado "no_asistio" para distinguir una ausencia de una
-- cancelación, y permite guardar una política de cancelación por consultorio.

alter table public.practice_settings
  add column if not exists cancellation_policy text not null default '';

alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('confirmado', 'pendiente', 'en_atencion', 'atendido', 'cancelado', 'no_asistio'));

notify pgrst, 'reload schema';
