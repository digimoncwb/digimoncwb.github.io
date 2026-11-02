begin;
alter table public.community_events add column if not exists reconcile_error text;

create or replace function public.community_correct_result(p_event uuid,p_data jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; m public.community_matches; r public.community_rounds;
 w integer; l integer; d integer; first_name text; second_name text;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status not in ('running','finished') then raise exception 'Torneio indisponível para correção.'; end if;
 if p_revision is null or e.revision<>p_revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select * into m from public.community_matches where id=(p_data->>'match_id')::uuid and event_id=e.id for update;
 if not found or m.p2 is null then raise exception 'Partida inválida.'; end if;
 if (p_data->>'match_revision') is null or (p_data->>'match_revision')::integer<>m.revision then raise exception 'O placar mudou. Atualize antes de corrigir.' using errcode='40001'; end if;
 select * into r from public.community_rounds where id=m.round_id;
 if r.status not in ('running','closed') then raise exception 'Inicie a rodada antes de informar resultados.'; end if;
 w:=(p_data->>'wins')::integer; l:=(p_data->>'losses')::integer; d:=(p_data->>'draws')::integer;
 if w is null or l is null or d is null or w<0 or w>2 or l<0 or l>2 or d<0 or d>1 or w+l+d not between 1 and 3 then raise exception 'O placar deve somar de 1 a 3 jogos.'; end if;
 select p.name into first_name from public.community_entries n join public.players p on p.id=n.player_id where n.id=m.p1;
 select p.name into second_name from public.community_entries n join public.players p on p.id=n.player_id where n.id=m.p2;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'match_before_resolution',to_jsonb(m));
 update public.community_matches set wins=w,losses=l,draws=d,status='confirmed',proposed_by=null,reason='',revision=revision+1 where id=m.id;
 update public.community_rounds rr set status='closed' where rr.id=r.id and rr.status='running'
  and not exists(select 1 from public.community_matches mm where mm.round_id=rr.id and mm.status<>'confirmed');
 -- Future pairings remain intact. A frozen final result requires a fresh staff review.
 if e.status='finished' then
  update public.community_events set status='running',final_order=null,final_snapshot=null,
   reconciliation=case when digilab_id is not null or canonical_tournament_id is not null then 'review' else reconciliation end,
   reconcile_error=case when digilab_id is not null or canonical_tournament_id is not null then 'Resultados locais corrigidos. Revise a classificação final e a submissão no DigiLab.' else reconcile_error end
  where id=e.id;
 end if;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'correct_result',
  jsonb_build_object('match_id',m.id,'round',r.number,'player_one',first_name,'player_two',second_name,'wins',w,'losses',l,'draws',d,'final_review_required',e.status='finished'));
 return public.community_snapshot(e.id);
end $$;
revoke all on function public.community_correct_result(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.community_correct_result(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
