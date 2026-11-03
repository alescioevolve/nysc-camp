-- Push subscriptions (corps members by platoon, officials by account) and duty assignments.

-- ---------- push subscriptions ----------
-- One row per phone. Corps members subscribe without an account (platoon only);
-- an official who signs in on the same phone gets linked so duty alerts reach them.
create table public.push_subs (
  id           bigserial primary key,
  camp_id      text not null references public.camps(id) on delete cascade,
  endpoint     text not null unique check (endpoint ~ '^https://' and length(endpoint) < 1000),
  p256dh       text not null check (length(p256dh) < 200),
  auth         text not null check (length(auth) < 100),
  platoon      text check (platoon is null or platoon ~ '^\d{1,2}$'),
  official_id  uuid references public.officials(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index push_subs_camp on public.push_subs (camp_id, platoon);
create index push_subs_official on public.push_subs (official_id);
alter table public.push_subs enable row level security;   -- no read policy: only the server reads it
revoke all on public.push_subs from anon, authenticated;

create or replace function public.push_subscribe(s_endpoint text, s_p256dh text, s_auth text, s_platoon text)
returns boolean language plpgsql security definer set search_path = public as $$
declare c text := (select id from public.camps where active);
begin
  if c is null then return false; end if;
  insert into public.push_subs (camp_id, endpoint, p256dh, auth, platoon)
  values (c, s_endpoint, s_p256dh, s_auth, nullif(s_platoon, ''))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    platoon = excluded.platoon, camp_id = excluded.camp_id, updated_at = now();
  return true;
end $$;

create or replace function public.push_link_official(s_endpoint text, s_p256dh text, s_auth text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me();
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  insert into public.push_subs (camp_id, endpoint, p256dh, auth, official_id)
  values (o.camp_id, s_endpoint, s_p256dh, s_auth, o.id)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    official_id = o.id, camp_id = o.camp_id, updated_at = now();
  return true;
end $$;

create or replace function public.push_unsubscribe(s_endpoint text)
returns boolean language sql security definer set search_path = public as $$
  with d as (delete from public.push_subs where endpoint = s_endpoint returning 1) select exists (select 1 from d)
$$;

grant execute on function public.push_subscribe(text, text, text, text) to anon, authenticated;
grant execute on function public.push_link_official(text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;

-- ---------- duties ----------
create table public.duties (
  id          uuid primary key default gen_random_uuid(),
  camp_id     text not null references public.camps(id) on delete cascade,
  title       text not null check (length(title) between 1 and 140),
  details     text not null default '' check (length(details) <= 2000),
  assignee    uuid not null references public.officials(id) on delete cascade,
  assignee_name text not null default '',
  creator_name  text not null default '',
  unit_id     uuid references public.units(id) on delete set null,
  due_at      timestamptz,
  status      text not null default 'open' check (status in ('open','done','cancelled')),
  note        text not null default '' check (length(note) <= 1000),
  created_by  uuid references public.officials(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index duties_camp on public.duties (camp_id, status, due_at);
alter table public.duties enable row level security;
create policy duties_read on public.duties for select to authenticated using (
  camp_id = (public.me()).camp_id and (
    (public.me()).role in ('director','deputy','coordinator')
    or assignee = (public.me()).id or created_by = (public.me()).id
    or ((public.me()).role = 'unit_head' and unit_id = (public.me()).unit_id)
  )
);
revoke insert, update, delete on public.duties from anon, authenticated;
grant select on public.duties to authenticated;

-- Create, edit or cancel a duty. Leads assign anyone; unit heads assign people in their unit.
create or replace function public.save_duty(d_id uuid, d_title text, d_details text, d_assignee uuid, d_due timestamptz, d_cancel boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.duties; t public.officials; nid uuid; when_txt text;
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if d_id is not null then
    select * into cur from public.duties where id = d_id and camp_id = o.camp_id for update;
    if cur.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if not (public.is_lead(o) or coalesce(cur.created_by = o.id, false)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  end if;
  if coalesce(d_cancel, false) then
    update public.duties set status = 'cancelled', updated_at = now() where id = d_id;
    perform public.log(o, 'duty', cur.title, array['Cancelled duty "' || cur.title || '"'], to_jsonb(cur), null);
    return d_id;
  end if;
  select * into t from public.officials where id = d_assignee and camp_id = o.camp_id and active;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_lead(o) or (o.role = 'unit_head' and t.unit_id is not null and t.unit_id = o.unit_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  when_txt := case when d_due is null then '' else ' by ' || to_char(d_due at time zone 'Africa/Lagos', 'Dy DD Mon, HH12:MI AM') end;
  if cur.id is null then
    insert into public.duties (camp_id, title, details, assignee, assignee_name, creator_name, unit_id, due_at, created_by)
    values (o.camp_id, d_title, coalesce(d_details, ''), t.id, t.name, o.name, t.unit_id, d_due, o.id) returning id into nid;
    perform public.log(o, 'duty', d_title, array['Assigned "' || d_title || '" to ' || t.name || when_txt], null, null);
  else
    update public.duties set title = d_title, details = coalesce(d_details, ''), assignee = t.id, assignee_name = t.name, unit_id = t.unit_id,
      due_at = d_due, updated_at = now() where id = d_id;
    nid := d_id;
    perform public.log(o, 'duty', d_title, array['Changed duty "' || d_title || '" (' || t.name || when_txt || ')'], to_jsonb(cur), null);
  end if;
  return nid;
end $$;

-- Mark a duty done or reopen it, with an optional note. The assignee, the creator or a lead.
create or replace function public.duty_status(d_id uuid, d_status text, d_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare o public.officials := public.me(); cur public.duties;
begin
  if o.id is null then raise exception 'not_signed_in' using errcode = '28000'; end if;
  if d_status not in ('open','done') then raise exception 'bad_status' using errcode = '22023'; end if;
  select * into cur from public.duties where id = d_id and camp_id = o.camp_id for update;
  if cur.id is null or cur.status = 'cancelled' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (cur.assignee = o.id or coalesce(cur.created_by = o.id, false) or public.is_lead(o)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.duties set status = d_status, note = coalesce(d_note, ''), updated_at = now(),
    done_at = case when d_status = 'done' then now() else null end where id = d_id;
  perform public.log(o, 'duty', cur.title, array[case when d_status = 'done' then 'Marked "' || cur.title || '" done' || case when coalesce(d_note,'') <> '' then ': ' || d_note else '' end
    else 'Reopened "' || cur.title || '"' end], to_jsonb(cur), null);
  return d_id;
end $$;

grant execute on function public.save_duty(uuid, text, text, uuid, timestamptz, boolean) to authenticated;
grant execute on function public.duty_status(uuid, text, text) to authenticated;
