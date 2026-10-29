-- Camp Companion pilot: camps, units, officials, content, announcements, audit log.
-- Public data (timetable, menu, fixtures, standings, live announcements) is readable by anyone.
-- Every write goes through a security-definer function that checks the caller's role,
-- so the rules live here, in the database, and not in the app.

-- gen_random_uuid() is built into Postgres 13+

-- ---------- camps ----------
create table public.camps (
  id          text primary key,                 -- e.g. 'rivers-2026-c2'
  name        text not null,
  starts_on   date not null,
  ends_on     date not null,
  platoons    int  not null default 10 check (platoons between 1 and 40),
  active      boolean not null default false,
  settings    jsonb not null default '{}'::jsonb, -- approval rules, quiet hours, etc.
  created_at  timestamptz not null default now()
);
create unique index camps_one_active on public.camps (active) where active;

-- ---------- units ----------
-- sections = which content this unit may edit: 'days', 'menu', 'fixtures', 'bestLosers', 'standings'
create table public.units (
  id        uuid primary key default gen_random_uuid(),
  camp_id   text not null references public.camps(id) on delete cascade,
  name      text not null,
  kind      text not null default 'general'
            check (kind in ('programme','sports','socials','saed','medical','welfare','kitchen','security','platoon','general')),
  sections  text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (camp_id, name)
);

-- ---------- officials ----------
create table public.officials (
  id          uuid primary key default gen_random_uuid(),
  camp_id     text not null references public.camps(id) on delete cascade,
  user_id     uuid unique,                        -- auth.users.id once they sign in
  name        text not null,
  email       text not null,                      -- lower-cased; synthetic for WhatsApp-only officials
  email_real  boolean not null default true,
  phone       text,
  role        text not null
              check (role in ('director','deputy','coordinator','unit_head','unit_member','platoon_officer','delegate')),
  unit_id     uuid references public.units(id) on delete set null,
  platoon     text,
  scopes      text[] not null default '{}',       -- delegates only: sections they may edit
  expires_at  timestamptz not null,
  active      boolean not null default true,
  invited_by  uuid references public.officials(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (camp_id, email)
);
create index officials_user on public.officials (user_id);

-- ---------- content sections (shape matches the old camp.json) ----------
-- key: 'days/2026-11-04', 'menu', 'fixtures', 'bestLosers', 'standings'
create table public.sections (
  camp_id     text not null references public.camps(id) on delete cascade,
  key         text not null,
  data        jsonb not null,
  version     int  not null default 1,
  updated_by  uuid references public.officials(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (camp_id, key)
);

-- ---------- announcements ----------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  camp_id     text not null references public.camps(id) on delete cascade,
  title       text not null check (length(title) between 1 and 140),
  body        text not null default '' check (length(body) <= 2000),
  urgent      boolean not null default false,
  platoon     text,                               -- null = everyone
  from_at     timestamptz not null default now(),
  to_at       timestamptz,
  created_by  uuid references public.officials(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  removed     boolean not null default false
);
create index announcements_camp on public.announcements (camp_id, removed, from_at);

-- ---------- audit log ----------
create table public.audit (
  id          bigserial primary key,
  camp_id     text not null,
  at          timestamptz not null default now(),
  actor       uuid,                               -- officials.id
  actor_name  text,
  action      text not null,                      -- 'save_section', 'invite', 'role', 'remove', 'announce', ...
  target      text,
  lines       text[] not null default '{}',       -- plain-language summary shown in Activity
  before      jsonb,
  after       jsonb
);
create index audit_camp_at on public.audit (camp_id, at desc);

-- =====================================================================
-- Helpers
-- =====================================================================

-- The caller's official row for the active camp (null if none, expired or inactive).
create or replace function public.me() returns public.officials
language sql stable security definer set search_path = public as $$
  select o.* from public.officials o
  join public.camps c on c.id = o.camp_id and c.active
  where o.user_id = auth.uid() and o.active and o.expires_at > now()
  limit 1
$$;

create or replace function public.is_lead(o public.officials) returns boolean
language sql immutable as $$ select o.role in ('director','deputy') $$;

-- Can the caller edit a content section?
create or replace function public.can_edit(o public.officials, k text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare base text := split_part(k, '/', 1); s text[];
begin
  if o.id is null then return false; end if;
  if o.role in ('director','deputy') then return true; end if;
  if o.role = 'delegate' then return base = any(o.scopes); end if;
  if o.role in ('unit_head','unit_member') and o.unit_id is not null then
    select sections into s from public.units where id = o.unit_id;
    return base = any(coalesce(s, '{}'));
  end if;
  return false;
end $$;

create or replace function public.log(o public.officials, action text, target text, lines text[], b jsonb, a jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit (camp_id, actor, actor_name, action, target, lines, before, after)
  values (coalesce(o.camp_id, (select id from public.camps where active)), o.id, o.name, action, target, coalesce(lines,'{}'), b, a)
$$;

-- =====================================================================
-- Writes
-- =====================================================================

-- Save one section with a version check (compare-and-swap).
-- Returns the new version, or raises 'conflict' with the current version in DETAIL.
create or replace function public.save_section(k text, d jsonb, expected int, lines text[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.sections; v int;
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if k !~ '^(days/\d{4}-\d{2}-\d{2}|menu|fixtures|bestLosers|standings)$' then
    raise exception 'bad_section' using errcode = '22023';
  end if;
  if not public.can_edit(o, k) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into cur from public.sections where camp_id = o.camp_id and key = k for update;
  if cur.key is null then
    if coalesce(expected, 0) <> 0 then raise exception 'conflict' using errcode = '40001', detail = '0'; end if;
    insert into public.sections (camp_id, key, data, version, updated_by) values (o.camp_id, k, d, 1, o.id);
    v := 1;
  else
    if cur.version <> expected then raise exception 'conflict' using errcode = '40001', detail = cur.version::text; end if;
    if cur.data = d then return cur.version; end if;
    update public.sections set data = d, version = cur.version + 1, updated_by = o.id, updated_at = now()
      where camp_id = o.camp_id and key = k;
    v := cur.version + 1;
  end if;
  perform public.log(o, 'save_section', k, lines, cur.data, d);
  return v;
end $$;

-- Who may post to a platoon or to everyone
create or replace function public.can_announce(o public.officials, p text) returns boolean
language sql stable as $$
  select o.id is not null and (
    o.role in ('director','deputy','unit_head')
    or (o.role = 'platoon_officer' and p is not null and p = o.platoon)
  )
$$;

create or replace function public.post_announcement(
  a_id uuid, a_title text, a_body text, a_urgent boolean, a_platoon text,
  a_from timestamptz, a_to timestamptz, a_remove boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.announcements; nid uuid;
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if a_id is not null then
    select * into cur from public.announcements where id = a_id and camp_id = o.camp_id for update;
    if cur.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not (public.is_lead(o) or cur.created_by = o.id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  end if;
  if not coalesce(a_remove, false) and not public.can_announce(o, nullif(a_platoon, '')) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if a_to is not null and a_from is not null and a_to <= a_from then raise exception 'bad_times' using errcode = '22023'; end if;

  if a_id is null then
    insert into public.announcements (camp_id, title, body, urgent, platoon, from_at, to_at, created_by)
    values (o.camp_id, a_title, coalesce(a_body,''), coalesce(a_urgent,false), nullif(a_platoon,''), coalesce(a_from, now()), a_to, o.id)
    returning id into nid;
    perform public.log(o, 'announce', nid::text, array['Posted "' || a_title || '"' ||
      case when nullif(a_platoon,'') is null then ' to everyone' else ' to Platoon ' || a_platoon end], null, null);
  elsif coalesce(a_remove, false) then
    update public.announcements set removed = true, updated_at = now() where id = a_id;
    nid := a_id;
    perform public.log(o, 'announce', nid::text, array['Removed "' || cur.title || '"'], to_jsonb(cur), null);
  else
    update public.announcements set title = a_title, body = coalesce(a_body,''), urgent = coalesce(a_urgent,false),
      platoon = nullif(a_platoon,''), from_at = coalesce(a_from, cur.from_at), to_at = a_to, updated_at = now()
      where id = a_id;
    nid := a_id;
    perform public.log(o, 'announce', nid::text, array['Edited "' || a_title || '"'], to_jsonb(cur), null);
  end if;
  return nid;
end $$;

-- Link the signed-in auth user to their official row (matched by email). Called right after sign-in.
create or replace function public.claim() returns public.officials
language plpgsql security definer set search_path = public as $$
declare em text; o public.officials;
begin
  select lower(email) into em from auth.users where id = auth.uid();
  if em is null then return null; end if;
  update public.officials set user_id = auth.uid()
    where user_id is null and email = em and camp_id = (select id from public.camps where active)
    returning * into o;
  return coalesce(o, public.me());
end $$;

-- Change someone's role, unit, platoon, scopes or expiry, or deactivate them.
-- Directors and deputies can change anyone except another director.
-- Unit heads can manage unit_member and delegate rows in their own unit.
create or replace function public.set_official(
  t_id uuid, t_role text, t_unit uuid, t_platoon text, t_scopes text[], t_expires timestamptz, t_active boolean)
returns public.officials language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.officials; res public.officials; ls text[] := '{}';
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  select * into cur from public.officials where id = t_id and camp_id = o.camp_id for update;
  if cur.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if cur.id = o.id and (t_role is distinct from cur.role or t_active is false) then
    raise exception 'cannot_change_self' using errcode = '42501';
  end if;
  if public.is_lead(o) then
    if cur.role = 'director' and o.role <> 'director' then raise exception 'not_allowed' using errcode = '42501'; end if;
    if t_role = 'director' and o.role <> 'director' then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif o.role = 'unit_head' then
    if cur.unit_id is distinct from o.unit_id or cur.role not in ('unit_member','delegate')
       or t_role not in ('unit_member','delegate') or t_unit is distinct from o.unit_id then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.officials set
    role = coalesce(t_role, role), unit_id = t_unit, platoon = nullif(t_platoon,''),
    scopes = coalesce(t_scopes, '{}'), expires_at = coalesce(t_expires, expires_at), active = coalesce(t_active, active)
  where id = t_id returning * into res;

  if res.role <> cur.role then ls := ls || ('Role: ' || cur.role || ' → ' || res.role); end if;
  if res.unit_id is distinct from cur.unit_id then
    ls := ls || ('Unit: ' || coalesce((select name from units where id = cur.unit_id), 'none') || ' → ' ||
                 coalesce((select name from units where id = res.unit_id), 'none'));
  end if;
  if res.platoon is distinct from cur.platoon then ls := ls || ('Platoon: ' || coalesce(cur.platoon,'none') || ' → ' || coalesce(res.platoon,'none')); end if;
  if res.active <> cur.active then ls := ls || (case when res.active then 'Access restored' else 'Access removed' end); end if;
  perform public.log(o, case when res.active then 'role' else 'remove' end, res.name, ls, to_jsonb(cur), to_jsonb(res));
  return res;
end $$;

-- Units: directors and deputies only
create or replace function public.save_unit(u_id uuid, u_name text, u_kind text, u_sections text[], u_delete boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.units; nid uuid;
begin
  if not public.is_lead(o) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if u_sections is not null and exists (select 1 from unnest(u_sections) s where s not in ('days','menu','fixtures','bestLosers','standings')) then
    raise exception 'bad_section' using errcode = '22023';
  end if;
  if u_id is not null then select * into cur from public.units where id = u_id and camp_id = o.camp_id; end if;
  if coalesce(u_delete,false) then
    delete from public.units where id = u_id and camp_id = o.camp_id;
    perform public.log(o, 'unit', cur.name, array['Removed unit ' || cur.name], to_jsonb(cur), null);
    return u_id;
  end if;
  if cur.id is null then
    insert into public.units (camp_id, name, kind, sections) values (o.camp_id, u_name, coalesce(u_kind,'general'), coalesce(u_sections,'{}'))
      returning id into nid;
    perform public.log(o, 'unit', u_name, array['Added unit ' || u_name], null, null);
  else
    update public.units set name = u_name, kind = coalesce(u_kind, kind), sections = coalesce(u_sections, sections) where id = u_id;
    nid := u_id;
    perform public.log(o, 'unit', u_name, array['Edited unit ' || u_name], to_jsonb(cur), null);
  end if;
  return nid;
end $$;

-- =====================================================================
-- Row level security: reads only. All writes go through the functions above.
-- =====================================================================
alter table public.camps          enable row level security;
alter table public.units          enable row level security;
alter table public.officials      enable row level security;
alter table public.sections       enable row level security;
alter table public.announcements  enable row level security;
alter table public.audit          enable row level security;

create policy camps_read on public.camps for select using (true);
create policy sections_read on public.sections for select using (true);
create policy ann_read on public.announcements for select using (not removed);

create policy units_read on public.units for select to authenticated
  using (camp_id = (public.me()).camp_id);

create policy officials_read on public.officials for select to authenticated using (
  user_id = auth.uid()
  or (public.is_lead(public.me()) and camp_id = (public.me()).camp_id)
  or ((public.me()).role = 'coordinator' and camp_id = (public.me()).camp_id)
  or ((public.me()).role = 'unit_head' and unit_id = (public.me()).unit_id)
);

create policy audit_read on public.audit for select to authenticated using (
  camp_id = (public.me()).camp_id and (
    (public.me()).role in ('director','deputy','coordinator') or actor = (public.me()).id
  )
);

revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
revoke all on function public.log(public.officials, text, text, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_section(text, jsonb, int, text[]) to authenticated;
grant execute on function public.post_announcement(uuid, text, text, boolean, text, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.claim() to authenticated;
grant execute on function public.set_official(uuid, text, uuid, text, text[], timestamptz, boolean) to authenticated;
grant execute on function public.save_unit(uuid, text, text, text[], boolean) to authenticated;
grant execute on function public.me() to authenticated;
