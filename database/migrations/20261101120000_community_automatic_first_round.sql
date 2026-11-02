begin;

-- Starting the event, publishing its first pairings and starting its clock are atomic.
create or replace function public.community_start_event(p_event uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare state jsonb; participants uuid[]; pairs jsonb; seed text:=gen_random_uuid()::text;
begin
 state:=public.community_command(p_event,'start','{}'::jsonb,p_revision);
 select array_agg(n.id order by md5(n.id::text||seed)) into participants
 from public.community_entries n where n.event_id=p_event and not n.dropped;
 select jsonb_agg(jsonb_build_object('p1',participants[i],'p2',participants[i+1]) order by i)
 into pairs from generate_series(1,cardinality(participants),2) as slots(i);
 state:=public.community_command(p_event,'pair',jsonb_build_object('pairs',pairs,'seed',seed),(state->'event'->>'revision')::integer);
 state:=public.community_command(p_event,'start_round','{}'::jsonb,(state->'event'->>'revision')::integer);
 return state;
end $$;
revoke all on function public.community_start_event(uuid,integer) from public,anon,authenticated;
grant execute on function public.community_start_event(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
