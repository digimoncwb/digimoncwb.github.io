begin;
-- Running-event discovery is restricted to participants who have not dropped.
create or replace function public.community_list(p_admin boolean default false) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_admin and not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)-'final_snapshot' order by x.starts_at),'[]') from (
  select e.*,f.code format_code,s.name store_name,(select count(*) from public.community_entries n where n.event_id=e.id)::integer registered,
   exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and u.user_id=auth.uid()) enrolled,
   exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and not n.dropped and u.user_id=auth.uid()) active_participant
  from public.community_events e join public.formats f on f.id=e.format_id left join public.stores s on s.id=e.store_id
  where p_admin or (e.status='published' and e.registration_open) or (e.status='running' and exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and not n.dropped and u.user_id=auth.uid())) or (e.status='finished' and exists(select 1 from public.community_entries n join public.user_profiles u on u.player_id=n.player_id where n.event_id=e.id and u.user_id=auth.uid()))
 ) x);
end $$;


notify pgrst,'reload schema';
commit;
