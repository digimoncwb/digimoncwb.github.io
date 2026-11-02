begin;
-- Clock changes remain administrator-only; the automatic audit records the actor and delta.
create or replace function public.community_command(p_event uuid,p_action text,p_data jsonb default '{}',p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; r public.community_rounds; m public.community_matches; admin boolean:=public.community_admin();
 me uuid; entry uuid; count_players integer; next_round integer; pair jsonb; pair_ids uuid[]:='{}'; a uuid; b uuid;
 w integer; l integer; d integer; standings jsonb; ordered jsonb; line text; header jsonb; actor_entry uuid; v_reason text:=btrim(coalesce(p_data->>'reason',''));
begin
 if auth.uid() is null or not public.site_has_identity() then raise exception 'Entre com uma conta ativa.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found then raise exception 'Torneio indisponível.'; end if;
 -- Independent registrations/results must not conflict merely because another table changed.
 -- Capacity is serialized by the event lock; result writes also check their own revision below.
 if p_revision is null or (e.revision<>p_revision and p_action not in ('register','propose','confirm','contest')) then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 select player_id into me from public.user_profiles where user_id=auth.uid();
 select id into actor_entry from public.community_entries where event_id=e.id and player_id=me;
 if p_action not in ('register','drop','deck','propose','confirm','contest') and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 if e.status in ('finished','cancelled') and p_action not in ('export','link_digilab','reconcile') then raise exception 'O torneio está encerrado.'; end if;

 if p_action in ('register','add_player') then
  if e.status not in ('draft','published') or (not admin and (e.status<>'published' or not e.registration_open)) then raise exception 'Inscrições encerradas.'; end if;
  if p_action='register' and me is null then raise exception 'Vincule sua conta a um jogador.' using errcode='42501'; end if;
  a:=case when p_action='add_player' then (p_data->>'player_id')::uuid else me end;
  if exists(select 1 from public.community_entries where event_id=e.id and player_id=a) then raise exception 'Jogador já inscrito.'; end if;
  if (select count(*) from public.community_entries where event_id=e.id)>=e.capacity then raise exception 'Vagas esgotadas.'; end if;
  insert into public.community_entries(event_id,player_id) values(e.id,a);
 elsif p_action='configure' then
  if e.status not in ('draft','published') then raise exception 'Configuração bloqueada após o início.'; end if;
  if (p_data->>'capacity')::integer < (select count(*) from public.community_entries where event_id=e.id) then raise exception 'A capacidade não pode ser menor que as inscrições existentes.'; end if;
  update public.community_events set name=btrim(p_data->>'name'),store_id=nullif(p_data->>'store_id','')::uuid,
   location=left(coalesce(p_data->>'location',''),500),modality=p_data->>'modality',starts_at=(p_data->>'starts_at')::timestamptz,
   event_type=p_data->>'event_type',format_id=(p_data->>'format_id')::bigint,capacity=(p_data->>'capacity')::integer where id=e.id;
 elsif p_action='publish' then
  if e.status<>'draft' then raise exception 'O evento já foi publicado.'; end if;
  update public.community_events set status='published' where id=e.id;
 elsif p_action='registration' then
  if e.status not in ('draft','published') then raise exception 'Publique o evento antes de abrir inscrições.'; end if;
  update public.community_events set status='published',registration_open=(p_data->>'open')::boolean where id=e.id;
 elsif p_action='deck' then
  if not admin and e.status not in ('draft','published') then raise exception 'Deck bloqueado após o início.'; end if;
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  update public.community_entries set deck_id=nullif(p_data->>'deck_id','')::uuid,decklist=coalesce(p_data->>'decklist','') where id=entry and event_id=e.id;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='start' then
  if e.status not in ('draft','published') then raise exception 'O torneio ja foi iniciado.'; end if;
  select count(*) into count_players from public.community_entries where event_id=e.id and not dropped;
  if count_players<4 or count_players>128 then raise exception 'Inscreva de 4 a 128 participantes.'; end if;
  update public.community_events set status='running',registration_open=false,checkin_open=false,initial_players=count_players,
   rounds=case when count_players<=8 then 3 when count_players<=16 then 4 when count_players<=32 then 5 when count_players<=64 then 6 else 7 end where id=e.id;
 elsif p_action='drop' then
  entry:=case when admin then coalesce(nullif(p_data->>'entry_id','')::uuid,actor_entry) else actor_entry end;
  p_data:=p_data||jsonb_build_object('target_names',coalesce((select jsonb_agg(p.name) from public.community_entries n join public.players p on p.id=n.player_id where n.id=entry and n.event_id=e.id),'[]'::jsonb),'entry_removed',e.status in ('draft','published'));
  if exists(select 1 from public.community_matches mm join public.community_rounds rr on rr.id=mm.round_id where mm.event_id=e.id and rr.status<>'closed' and (mm.p1=entry or mm.p2=entry) and mm.status<>'confirmed') then raise exception 'Resolva a partida atual com a organização antes de desistir.'; end if;
  if e.status in ('draft','published') then
   delete from public.community_entries where id=entry and event_id=e.id;
  else
   update public.community_entries set dropped=true where id=entry and event_id=e.id;
  end if;
  if not found then raise exception 'Inscrição não encontrada.'; end if;
 elsif p_action='pair' then
  if e.status<>'running' or exists(select 1 from public.community_rounds where event_id=e.id and status<>'closed') then raise exception 'Encerre a rodada anterior.'; end if;
  select coalesce(max(number),0)+1 into next_round from public.community_rounds where event_id=e.id;
  if next_round>e.rounds then raise exception 'Todas as rodadas já foram realizadas.'; end if;
  if jsonb_typeof(p_data->'pairs') is distinct from 'array' then raise exception 'Mesas inválidas.'; end if;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   if a is null or a=any(pair_ids) or b=a or (b is not null and b=any(pair_ids)) then raise exception 'Participante repetido nas mesas.'; end if;
   if not exists(select 1 from public.community_entries where id=a and event_id=e.id and not dropped) or
    (b is not null and not exists(select 1 from public.community_entries where id=b and event_id=e.id and not dropped)) then raise exception 'Participante inativo ou de outro evento.'; end if;
   if v_reason='' and b is not null and exists(select 1 from public.community_matches where event_id=e.id and ((p1=a and p2=b) or(p1=b and p2=a))) then raise exception 'Reencontro exige justificativa da organização.'; end if;
   pair_ids:=array_append(pair_ids,a); if b is not null then pair_ids:=array_append(pair_ids,b); end if;
  end loop;
  select count(*) into count_players from public.community_entries where event_id=e.id and not dropped;
  if count_players<2 or cardinality(pair_ids)<>count_players or jsonb_array_length(p_data->'pairs')<>(count_players+1)/2 then raise exception 'Informe todas as mesas e no máximo um bye.'; end if;
  -- Automatic byes may not be repeated while an active player has fewer byes.
  if v_reason='' and exists(select 1 from jsonb_array_elements(p_data->'pairs') q where q->>'p2' is null and
    (select count(*) from public.community_matches where event_id=e.id and p1=(q->>'p1')::uuid and p2 is null)>
    (select min(x.n) from (select (select count(*) from public.community_matches where event_id=e.id and p1=n.id and p2 is null) n from public.community_entries n where event_id=e.id and not dropped) x)) then raise exception 'Bye repetido exige justificativa.'; end if;
  insert into public.community_rounds(event_id,number,seed) values(e.id,next_round,left(coalesce(p_data->>'seed','manual'),100)) returning * into r;
  count_players:=0;
  for pair in select value from jsonb_array_elements(p_data->'pairs') loop
   count_players:=count_players+1; a:=(pair->>'p1')::uuid; b:=nullif(pair->>'p2','')::uuid;
   insert into public.community_matches(event_id,round_id,table_number,p1,p2,wins,losses,draws,status,reason)
    values(e.id,r.id,count_players,a,b,case when b is null then 2 end,case when b is null then 0 end,case when b is null then 0 end,case when b is null then 'confirmed' else 'pending' end,v_reason);
  end loop;
 elsif p_action in ('start_round','close_round','adjust_clock','undo_round','reopen_round') then
  select * into r from public.community_rounds where event_id=e.id order by number desc limit 1 for update;
  if not found then raise exception 'Rodada não encontrada.'; end if;
  if p_action='start_round' then
   if r.status<>'paired' then raise exception 'Rodada já iniciada.'; end if;
   update public.community_rounds set status='running',started_at=now(),ends_at=now()+interval '45 minutes',overtime_ends_at=now()+interval '50 minutes' where id=r.id;
  elsif p_action='reopen_round' then
   if r.status<>'closed' then raise exception 'A rodada precisa estar encerrada.'; end if;
   update public.community_rounds set status='running' where id=r.id;
  elsif p_action='adjust_clock' then
   if r.status<>'running' or (p_data->>'seconds') is null or abs((p_data->>'seconds')::integer)>3600 then raise exception 'Informe ajuste de até uma hora.'; end if;
   update public.community_rounds set ends_at=ends_at+make_interval(secs=>(p_data->>'seconds')::integer),overtime_ends_at=overtime_ends_at+make_interval(secs=>(p_data->>'seconds')::integer) where id=r.id;
  elsif p_action='undo_round' then
   if v_reason='' then raise exception 'Justifique a invalidação da última rodada.'; end if;
   insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'invalidated_round_snapshot',
    jsonb_build_object('round',to_jsonb(r),'matches',(select jsonb_agg(to_jsonb(mm)) from public.community_matches mm where mm.round_id=r.id),'reason',v_reason));
   delete from public.community_rounds where id=r.id;
  else
   if r.status<>'running' or exists(select 1 from public.community_matches where round_id=r.id and status<>'confirmed') then raise exception 'Resolva todos os resultados da rodada.'; end if;
   update public.community_rounds set status='closed' where id=r.id;
  end if;
 elsif p_action in ('propose','confirm','contest','resolve') then
  select * into m from public.community_matches where id=(p_data->>'match_id')::uuid and event_id=e.id for update;
  if not found or m.p2 is null then raise exception 'Partida inválida.'; end if;
  if (p_data->>'match_revision') is null or (p_data->>'match_revision')::integer<>m.revision then raise exception 'O placar mudou. Atualize antes de confirmar ou corrigir.' using errcode='40001'; end if;
  select * into r from public.community_rounds where id=m.round_id;
  if r.status<>'running' then raise exception 'A rodada não está em andamento. Invalide as rodadas posteriores para corrigir.'; end if;
  if not admin and (actor_entry is null or actor_entry not in (m.p1,m.p2)) then raise exception 'Você não participa desta partida.' using errcode='42501'; end if;
  if p_action in ('propose','contest','resolve') then
   if p_action='resolve' and not admin then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
   if p_action='contest' and (m.status<>'proposed' or actor_entry is null or actor_entry=m.proposed_by or actor_entry not in (m.p1,m.p2)) then raise exception 'Somente o adversário pode refutar a proposta.'; end if;
   if p_action='propose' and m.status not in ('pending','contested') then raise exception 'Já existe resultado. Confirme ou conteste.'; end if;
   if p_action='resolve' then
    insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'match_before_resolution',to_jsonb(m));
   end if;
   w:=(p_data->>'wins')::integer; l:=(p_data->>'losses')::integer; d:=(p_data->>'draws')::integer;
   if w is null or l is null or d is null then raise exception 'Informe o placar completo.'; end if;
   if w<0 or w>2 or l<0 or l>2 or d<0 or d>1 or w+l+d not between 1 and 3 then raise exception 'O placar deve somar de 1 a 3 jogos.'; end if;
   if not admin and w<2 and l<2 and now()<r.ends_at then raise exception 'Placar incompleto: aguarde o limite de tempo ou procure a organização.'; end if;
   if not admin and d>0 and now()<r.overtime_ends_at then raise exception 'O jogo empatado por tempo só deve ser informado após o overtime.'; end if;
   if not admin and actor_entry=m.p2 then count_players:=w; w:=l; l:=count_players; end if;
   update public.community_matches set wins=w,losses=l,draws=d,status=case when p_action='resolve' then 'confirmed' else 'proposed' end,proposed_by=actor_entry,reason=v_reason,revision=revision+1 where id=m.id;
  else
   if m.status<>'proposed' or actor_entry=m.proposed_by or actor_entry is null then raise exception 'Somente o adversário pode confirmar ou contestar a proposta.'; end if;
   update public.community_matches set status=case when p_action='confirm' then 'confirmed' else 'contested' end,revision=revision+1 where id=m.id;
  end if;
 elsif p_action='finish' then
  if e.status<>'running' or (select count(*) from public.community_rounds where event_id=e.id and status='closed')<>e.rounds then raise exception 'Conclua todas as rodadas.'; end if;
  standings:=public.community_standings(e.id);
  select coalesce(jsonb_agg(v->>'id'),'[]') into ordered from jsonb_array_elements(standings) v where (v->>'checked_in')::boolean;
  if p_data ? 'order' then
   if jsonb_typeof(p_data->'order')<>'array' or jsonb_array_length(p_data->'order')<>jsonb_array_length(ordered) or
    exists(select 1 from jsonb_array_elements_text(ordered) x where not (p_data->'order') ? x) or
    (select count(distinct x) from jsonb_array_elements_text(p_data->'order') x)<>jsonb_array_length(ordered) then raise exception 'Ordem final inválida.'; end if;
   ordered:=p_data->'order';
  end if;
  -- Explicit staff review is required while the TCG+ reference validation remains pending.
  if coalesce((p_data->>'reviewed')::boolean,false)=false then raise exception 'Confirme a classificacao final.'; end if;
  update public.community_events set status='finished',final_order=ordered,final_snapshot=standings where id=e.id;
 elsif p_action='export' then
  if e.status<>'finished' then raise exception 'Finalize e revise o torneio antes de copiar.'; end if;
  standings:=e.final_snapshot;
  select string_agg(o.ordinality::text||' '||regexp_replace(btrim(coalesce(nullif(btrim(s->>'digilab_name'),''),s->>'name')),'\s+',' ','g')||
   case when nullif(btrim(s->>'bandai_id'),'') is null then '' else ' #'||regexp_replace(btrim(s->>'bandai_id'),'^#+','') end||' '||(s->>'points'),E'\n' order by o.ordinality)
   into line from jsonb_array_elements_text(e.final_order) with ordinality o(id,ordinality) join jsonb_array_elements(standings) s on s->>'id'=o.id;
  header:=jsonb_build_object('store_id',e.store_id,'organizer',e.organizer,'type',e.event_type,'date',(e.starts_at at time zone 'America/Sao_Paulo')::date,
   'format',(select code from public.formats where id=e.format_id),'rounds',e.rounds,'players',e.initial_players);
  insert into public.community_exports(event_id,revision,header,body) values(e.id,e.revision,header,line);
 elsif p_action='link_digilab' then
  if e.status<>'finished' or (p_data->>'digilab_id')::bigint<=0 then raise exception 'Informe o ID DigiLab de um evento finalizado.'; end if;
  update public.community_events set digilab_id=(p_data->>'digilab_id')::bigint,reconciliation='pending' where id=e.id;
 elsif p_action='cancel' then
  update public.community_events set status='cancelled',registration_open=false,checkin_open=false where id=e.id;
 else raise exception 'Ação desconhecida.';
 end if;
 -- Close only after every opponent has accepted. The next round remains an explicit action.
 if p_action in ('confirm','resolve') then
  update public.community_rounds rr set status='closed'
  where rr.event_id=e.id and rr.status='running'
   and not exists(select 1 from public.community_matches mm where mm.round_id=rr.id and mm.status<>'confirmed');
 end if;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),p_action,p_data-'decklist');
 return public.community_snapshot(e.id);
end $$;



notify pgrst,'reload schema';
commit;
