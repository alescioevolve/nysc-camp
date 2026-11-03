-- Only real browser push services may be stored as subscription addresses, so the server
-- never sends requests to an address someone made up.
create or replace function public.push_host_ok(e text) returns boolean
language sql immutable set search_path = public as $$
  select e ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
$$;
revoke execute on function public.push_host_ok(text) from public, anon, authenticated;
delete from public.push_subs where not public.push_host_ok(endpoint);
alter table public.push_subs add constraint push_subs_host check (public.push_host_ok(endpoint));
