-- App support role (full access, not presented as a camp official) and the kitchen duty roster.
alter table public.officials drop constraint officials_role_check;
alter table public.officials add constraint officials_role_check
  check (role in ('admin','director','deputy','coordinator','unit_head','unit_member','platoon_officer','delegate'));

create or replace function public.is_lead(o public.officials) returns boolean
language sql immutable set search_path = public as $$ select o.role in ('admin','director','deputy') $$;

create or replace function public.can_edit(o public.officials, k text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare base text := split_part(k, '/', 1); s text[];
begin
  if o.id is null then return false; end if;
  if public.is_lead(o) then return true; end if;
  if o.role = 'delegate' then return base = any(o.scopes); end if;
  if o.role in ('unit_head','unit_member') and o.unit_id is not null then
    select sections into s from public.units where id = o.unit_id;
    return base = any(coalesce(s, '{}'));
  end if;
  return false;
end $$;

create or replace function public.can_announce(o public.officials, p text) returns boolean
language sql stable set search_path = public as $$
  select o.id is not null and (
    o.role in ('admin','director','deputy','unit_head')
    or (o.role = 'platoon_officer' and p is not null and p = o.platoon)
  )
$$;

create or replace function public.save_section(k text, d jsonb, expected int, lines text[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.sections; v int;
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if k !~ '^(days/\d{4}-\d{2}-\d{2}|menu|roster|fixtures|bestLosers|standings)$' then
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
    if 'admin' in (cur.role, t_role) and o.role <> 'admin' then raise exception 'not_allowed' using errcode = '42501'; end if;
    if 'director' in (cur.role, t_role) and o.role not in ('director','admin') then raise exception 'not_allowed' using errcode = '42501'; end if;
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

create or replace function public.save_unit(u_id uuid, u_name text, u_kind text, u_sections text[], u_delete boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.units; nid uuid;
begin
  if not public.is_lead(o) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if u_sections is not null and exists (select 1 from unnest(u_sections) s where s not in ('days','menu','roster','fixtures','bestLosers','standings')) then
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

drop policy audit_read on public.audit;
create policy audit_read on public.audit for select to authenticated using (
  camp_id = (public.me()).camp_id and (
    (public.me()).role in ('admin','director','deputy','coordinator') or actor = (public.me()).id
  )
);
drop policy duties_read on public.duties;
create policy duties_read on public.duties for select to authenticated using (
  camp_id = (public.me()).camp_id and (
    (public.me()).role in ('admin','director','deputy','coordinator')
    or assignee = (public.me()).id or created_by = (public.me()).id
    or ((public.me()).role = 'unit_head' and unit_id = (public.me()).unit_id)
  )
);

revoke execute on function public.can_edit(public.officials, text) from public, anon, authenticated;
revoke execute on function public.can_announce(public.officials, text) from public, anon, authenticated;
revoke execute on function public.is_lead(public.officials) from public, anon;
grant execute on function public.is_lead(public.officials) to authenticated;
revoke execute on function public.save_section(text, jsonb, int, text[]) from public, anon;
revoke execute on function public.set_official(uuid, text, uuid, text, text[], timestamptz, boolean) from public, anon;
revoke execute on function public.save_unit(uuid, text, text, text[], boolean) from public, anon;
grant execute on function public.save_section(text, jsonb, int, text[]) to authenticated;
grant execute on function public.set_official(uuid, text, uuid, text, text[], timestamptz, boolean) to authenticated;
grant execute on function public.save_unit(uuid, text, text, text[], boolean) to authenticated;

-- Kitchen looks after the duty roster too (only if the unit is still as seeded)
update public.units set sections = '{menu,roster}' where kind = 'kitchen' and sections = '{menu}';
