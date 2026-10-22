-- Tolaris Diagnóstico: esquema inicial.
-- IMPORTANTE: não existe nenhuma tabela de pacientes nem de exames/laudos. O sistema só guarda
-- clínicas, usuários, e os critérios (presets) de cada clínica.

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.memberships (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'doctor' check (role in ('admin', 'doctor')),
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.presets (
  id text primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index presets_clinic_idx on public.presets (clinic_id);

create table public.custom_exams (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  id text not null,
  name text not null,
  unit text not null default '',
  aliases text[] not null,
  primary key (clinic_id, id)
);

-- Pertencimento à clínica. SECURITY DEFINER evita recursão de RLS ao consultar memberships.
create function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m where m.clinic_id = c and m.user_id = auth.uid()
  );
$$;

-- Cria a clínica e torna o usuário atual administrador dela.
create function public.create_clinic(clinic_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if clinic_name is null or length(trim(clinic_name)) = 0 then
    raise exception 'nome da clínica obrigatório';
  end if;
  insert into public.clinics (name) values (trim(clinic_name)) returning id into new_id;
  insert into public.memberships (clinic_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end;
$$;

alter table public.clinics enable row level security;
alter table public.memberships enable row level security;
alter table public.presets enable row level security;
alter table public.custom_exams enable row level security;

create policy clinics_select on public.clinics for select to authenticated using (public.is_member(id));
create policy memberships_select on public.memberships for select to authenticated using (user_id = auth.uid());

create policy presets_select on public.presets for select to authenticated using (public.is_member(clinic_id));
create policy presets_insert on public.presets for insert to authenticated with check (public.is_member(clinic_id));
create policy presets_update on public.presets for update to authenticated
  using (public.is_member(clinic_id)) with check (public.is_member(clinic_id));
create policy presets_delete on public.presets for delete to authenticated using (public.is_member(clinic_id));

create policy custom_exams_select on public.custom_exams for select to authenticated using (public.is_member(clinic_id));
create policy custom_exams_insert on public.custom_exams for insert to authenticated with check (public.is_member(clinic_id));
create policy custom_exams_update on public.custom_exams for update to authenticated
  using (public.is_member(clinic_id)) with check (public.is_member(clinic_id));
create policy custom_exams_delete on public.custom_exams for delete to authenticated using (public.is_member(clinic_id));

-- Privilégios mínimos: visitantes (anon) não acessam nada.
revoke all on public.clinics, public.memberships, public.presets, public.custom_exams from anon, public;
revoke execute on function public.create_clinic(text), public.is_member(uuid) from anon, public;
grant select on public.clinics, public.memberships to authenticated;
grant select, insert, update, delete on public.presets, public.custom_exams to authenticated;
grant execute on function public.create_clinic(text), public.is_member(uuid) to authenticated;
