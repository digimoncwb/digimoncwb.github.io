begin;
alter table public.community_events add column if not exists last_reconcile_at timestamptz;
alter table public.community_events add column if not exists reconcile_error text;

create or replace function public.community_import_context(p_external bigint) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select to_jsonb(e) from public.community_events e where e.digilab_id=p_external and e.status='finished'
$$;
create or replace function public.community_pending_links() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
  select id,digilab_id from public.community_events where status='finished' and digilab_id is not null
   and (last_reconcile_at is null or last_reconcile_at<now()-interval '1 hour') order by last_reconcile_at nulls first,id limit 5
 ) x
$$;
create or replace function public.community_import_failure(p_external bigint,p_message text) returns void
language sql security definer set search_path=pg_catalog,public as $$
 update public.community_events set last_reconcile_at=now(),reconcile_error=left(p_message,1000) where digilab_id=p_external
$$;

create or replace function public.community_reconcile(p_external bigint,p_tournament jsonb,p_standings jsonb,p_dnfs jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; s jsonb; local_entry public.community_entries; local_player public.players;
 mappings jsonb:='[]'; result jsonb; local_scores jsonb; pos integer:=0; ext_points integer; issue text;
begin
 select * into e from public.community_events where digilab_id=p_external and status='finished' for update;
 if not found then raise exception 'Vínculo operacional não encontrado.'; end if;
 update public.community_events set last_reconcile_at=now() where id=e.id;
 begin
  if jsonb_typeof(p_standings) is distinct from 'array' or jsonb_array_length(p_standings)<>e.initial_players or
   (p_tournament->>'player_count')::integer is distinct from e.initial_players or jsonb_array_length(p_dnfs)>0 then raise exception 'Classificação externa incompleta ou com DNF: revise o envio.'; end if;
  if (p_tournament->>'date')::date is distinct from (e.starts_at at time zone 'America/Sao_Paulo')::date or
   public.digilab_normalize(p_tournament->>'format') is distinct from (select public.digilab_normalize(code) from public.formats where id=e.format_id) or
   (nullif(p_tournament->>'rounds','') is not null and (p_tournament->>'rounds')::integer<>e.rounds) then raise exception 'Data, formato ou rodadas diferem do evento operacional.'; end if;
  if e.store_id is not null and public.digilab_normalize(p_tournament#>>'{store,name}') is distinct from
   (select public.digilab_normalize(name) from public.stores where id=e.store_id) then raise exception 'A loja do DigiLab difere da loja do evento.'; end if;
  local_scores:=public.community_standings(e.id);
  for s in select value from jsonb_array_elements(p_standings) order by (value->>'placement')::integer loop
   pos:=pos+1;
   if (s->>'placement')::integer is distinct from pos then raise exception 'Colocações externas incompletas ou empatadas.'; end if;
   select * into local_entry from public.community_entries where id=(e.final_order->>(pos-1))::uuid and event_id=e.id;
   if not found then raise exception 'Participante local não encontrado.'; end if;
   select * into local_player from public.players where id=local_entry.player_id;
   if nullif(s#>>'{player,slug}','') is null or not (
    public.digilab_normalize(s#>>'{player,name}')=public.digilab_normalize(local_player.name) or
    public.digilab_normalize(s#>>'{player,name}')=public.digilab_normalize(local_player.digilab_name) or
    exists(select 1 from public.digilab_player_sync where digilab_player_slug=s#>>'{player,slug}' and player_id=local_player.id)
   ) then raise exception 'Jogador ou colocação divergente na posição %.',pos; end if;
   if exists(select 1 from public.digilab_player_sync where digilab_player_slug=s#>>'{player,slug}' and player_id<>local_player.id) then raise exception 'Identidade DigiLab vinculada a outro jogador.'; end if;
   ext_points:=case when s#>>'{record,wins}' is not null and s#>>'{record,ties}' is not null
    then 3*(s#>>'{record,wins}')::integer+(s#>>'{record,ties}')::integer else nullif(s->>'match_points','')::integer end;
   if ext_points is not null and ext_points is distinct from (select (v->>'points')::integer from jsonb_array_elements(local_scores) v where v->>'id'=local_entry.id::text) then raise exception 'Pontos divergentes na posição %.',pos; end if;
   mappings:=mappings||jsonb_build_array(jsonb_build_object('digilab_player_slug',s#>>'{player,slug}','player_id',local_player.id));
  end loop;
  result:=public.sync_digilab_tournament_atomic(p_external,p_tournament||jsonb_build_object('tournament_name',e.event_type),p_standings,mappings,'[]',e.canonical_tournament_id);
  update public.community_events set canonical_tournament_id=(result->>'tournament_id')::bigint,reconciliation='matched',reconcile_error=null,revision=revision+1 where id=e.id;
  insert into public.community_audit(event_id,action,details) values(e.id,'digilab_reconciled',jsonb_build_object('external_id',p_external,'tournament_id',result->'tournament_id'));
  return result||jsonb_build_object('ok',true);
 exception when others then
  get stacked diagnostics issue=message_text;
  update public.community_events set reconciliation='review',reconcile_error=left(issue,1000),revision=revision+1 where id=e.id;
  insert into public.community_audit(event_id,action,details) values(e.id,'digilab_review',jsonb_build_object('external_id',p_external,'error',left(issue,1000)));
  return jsonb_build_object('ok',false,'needs_review',true,'error',issue);
 end;
end $$;

revoke all on function public.community_import_context(bigint),public.community_pending_links(),public.community_import_failure(bigint,text),public.community_reconcile(bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.community_import_context(bigint),public.community_pending_links(),public.community_import_failure(bigint,text),public.community_reconcile(bigint,jsonb,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
