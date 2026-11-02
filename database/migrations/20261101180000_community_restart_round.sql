begin;
alter table public.community_rounds drop constraint if exists community_rounds_status_check;
alter table public.community_rounds add constraint community_rounds_status_check check(status in ('paired','running','closed','paused'));

create or replace function public.community_pause_round(p_event uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; r public.community_rounds; previous_matches jsonb;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status='paused' then raise exception 'Não há rodada ativa para parar.'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.table_number),'[]'::jsonb) into previous_matches from public.community_matches m where m.round_id=r.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'paused_round_snapshot',jsonb_build_object('round',to_jsonb(r),'matches',previous_matches));
 delete from public.community_matches where round_id=r.id;
 update public.community_rounds set status='paused' where id=r.id;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'pause_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;

create or replace function public.community_restart_round(p_event uuid,p_data jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; r public.community_rounds; state jsonb;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status<>'paused' then raise exception 'Pare a rodada antes de refazer os pareamentos.'; end if;
 if exists(select 1 from public.community_matches where round_id=r.id) then raise exception 'A rodada pausada recebeu resultados. Atualize antes de continuar.'; end if;
 -- Pair validation and clock start share this transaction; a failure restores the paused row.
 delete from public.community_rounds where id=r.id;
 state:=public.community_command(e.id,'pair',jsonb_build_object('pairs',p_data->'pairs','seed',p_data->>'seed'),e.revision);
 state:=public.community_command(e.id,'start_round','{}'::jsonb,(state->'event'->>'revision')::integer);
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'restart_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;
revoke all on function public.community_pause_round(uuid,integer),public.community_restart_round(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.community_pause_round(uuid,integer),public.community_restart_round(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
