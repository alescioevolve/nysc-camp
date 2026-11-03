-- Tighten who can call what. Signed-out visitors only need the alert subscribe/unsubscribe calls;
-- internal helpers are not callable from the API at all.
alter function public.can_announce(public.officials, text) set search_path = public;
alter function public.is_lead(public.officials) set search_path = public;

revoke execute on function public.can_edit(public.officials, text) from public, anon, authenticated;
revoke execute on function public.can_announce(public.officials, text) from public, anon, authenticated;
-- is_lead() and me() stay callable by signed-in users: the read policies use them
revoke execute on function public.is_lead(public.officials) from public, anon;
grant execute on function public.is_lead(public.officials) to authenticated;

revoke execute on function public.me() from public, anon;
revoke execute on function public.claim() from public, anon;
revoke execute on function public.save_section(text, jsonb, int, text[]) from public, anon;
revoke execute on function public.post_announcement(uuid, text, text, boolean, text, timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.set_official(uuid, text, uuid, text, text[], timestamptz, boolean) from public, anon;
revoke execute on function public.save_unit(uuid, text, text, text[], boolean) from public, anon;
revoke execute on function public.push_link_official(text, text, text) from public, anon;
revoke execute on function public.save_duty(uuid, text, text, uuid, timestamptz, boolean) from public, anon;
revoke execute on function public.duty_status(uuid, text, text) from public, anon;
