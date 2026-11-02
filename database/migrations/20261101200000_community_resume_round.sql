begin;

create or replace function public.community_resume_round(p_event uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; r public.community_rounds; archived public.community_audit;
 saved public.community_rounds; elapsed interval;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status<>'running' then raise exception 'O torneio precisa estar em andamento.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
 if not found or r.status<>'paused' then raise exception 'A rodada precisa estar pausada para continuar.'; end if;
 select * into archived from public.community_audit
 where event_id=e.id and action='paused_round_snapshot' and details->'round'->>'id'=r.id::text
 order by id desc limit 1;
 if not found then raise exception 'Não foi possível recuperar esta rodada. Refaça os pareamentos.'; end if;
 select * into saved from jsonb_populate_record(null::public.community_rounds,archived.details->'round');
 if saved.status not in ('running','paired','closed') then raise exception 'Estado salvo da rodada inválido.'; end if;
 if exists(select 1 from public.community_matches where round_id=r.id) then raise exception 'A rodada pausada recebeu resultados. Atualize antes de continuar.'; end if;
 -- A pending table with a new drop must be paired again, rather than silently restoring an absent opponent.
 if exists(
  select 1 from jsonb_populate_recordset(null::public.community_matches,archived.details->'matches') m
  join public.community_entries n on n.id=m.p1 or n.id=m.p2
  where m.status<>'confirmed' and n.dropped
 ) then raise exception 'Um jogador desta rodada deu DROP. Refaça os pareamentos para continuar.'; end if;
 insert into public.community_matches
 select (jsonb_populate_record(null::public.community_matches,to_jsonb(m)||jsonb_build_object('revision',m.revision+1))).*
 from jsonb_populate_recordset(null::public.community_matches,archived.details->'matches') m;
 -- Freeze the clock across the entire pause, retaining elapsed overtime as well as normal time.
 elapsed:=case when saved.status='running' then greatest(now()-archived.created_at,interval '0 seconds') else interval '0 seconds' end;
 update public.community_rounds set status=saved.status,started_at=saved.started_at+elapsed,
  ends_at=saved.ends_at+elapsed,overtime_ends_at=saved.overtime_ends_at+elapsed where id=r.id;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details)
 values(e.id,auth.uid(),'resume_round',jsonb_build_object('round',r.number));
 return public.community_snapshot(e.id);
end $$;
revoke all on function public.community_resume_round(uuid,integer) from public,anon,authenticated;
grant execute on function public.community_resume_round(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
