-- Convite de médicos para a clínica e gestão da equipe.
-- Segurança: o segredo do convite NUNCA é guardado (só o hash SHA-256); o convite é de uso único, expira,
-- é vinculado ao e-mail convidado e só administradores da clínica gerenciam convites e equipe.

create function public.is_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.clinic_id = c and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  email text not null check (length(trim(email)) > 3 and email like '%_@_%'),
  role text not null default 'doctor' check (role in ('admin', 'doctor')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid
);
create index invites_clinic_idx on public.invites (clinic_id);

alter table public.invites enable row level security;

create policy invites_select on public.invites for select to authenticated using (public.is_admin(clinic_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (
    public.is_admin(clinic_id)
    and accepted_at is null and accepted_by is null
    and expires_at <= now() + interval '31 days'
  );
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_admin(clinic_id) and accepted_at is null);

-- Aceita um convite pelo segredo. Atômico (uso único) e só vale para o e-mail convidado.
create function public.accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  uemail text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  uemail := lower(coalesce(auth.jwt() ->> 'email', ''));

  update public.invites
     set accepted_at = now(), accepted_by = auth.uid()
   where token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex')
     and accepted_at is null
     and expires_at > now()
     and lower(email) = uemail
  returning * into inv;

  if inv.id is null then
    raise exception 'convite inválido, expirado, já usado ou emitido para outro e-mail';
  end if;

  insert into public.memberships (clinic_id, user_id, role)
  values (inv.clinic_id, auth.uid(), inv.role)
  on conflict (clinic_id, user_id) do nothing;

  return inv.clinic_id;
end;
$$;

-- Equipe da clínica (com e-mails). Só administradores enxergam; para os demais, a lista vem vazia.
create function public.clinic_members(c uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.clinic_id = c and public.is_admin(c)
  order by m.created_at;
$$;

-- Troca o papel de um membro. A clínica sempre mantém pelo menos um administrador.
create function public.set_member_role(c uuid, target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'sem permissão'; end if;
  if new_role not in ('admin', 'doctor') then raise exception 'papel inválido'; end if;
  perform 1 from public.memberships where clinic_id = c for update; -- evita corrida entre dois administradores
  if new_role = 'doctor' and not exists (
    select 1 from public.memberships where clinic_id = c and role = 'admin' and user_id <> target
  ) then
    raise exception 'a clínica precisa ter pelo menos um administrador';
  end if;
  update public.memberships set role = new_role where clinic_id = c and user_id = target;
  if not found then raise exception 'membro não encontrado'; end if;
end;
$$;

-- Remove um membro da clínica (sem apagar a conta dele). Nunca remove o último administrador.
create function public.remove_member(c uuid, target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'sem permissão'; end if;
  perform 1 from public.memberships where clinic_id = c for update;
  if exists (select 1 from public.memberships where clinic_id = c and user_id = target and role = 'admin')
     and not exists (select 1 from public.memberships where clinic_id = c and role = 'admin' and user_id <> target) then
    raise exception 'a clínica precisa ter pelo menos um administrador';
  end if;
  delete from public.memberships where clinic_id = c and user_id = target;
  if not found then raise exception 'membro não encontrado'; end if;
end;
$$;

revoke all on public.invites from anon, public;
revoke execute on function
  public.is_admin(uuid), public.accept_invite(text), public.clinic_members(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid)
  from anon, public;
grant select, insert, delete on public.invites to authenticated;
grant execute on function
  public.is_admin(uuid), public.accept_invite(text), public.clinic_members(uuid),
  public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid)
  to authenticated;
