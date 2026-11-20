begin;

-- DigiLab can report tied places (e.g. 1st, 1st, 3rd) at any position when an event has
-- standings but no match slips. Imports used to stop with "Colocacoes incompletas ou
-- empatadas". DigiStats keeps unique places, so tied players are numbered in DigiLab's
-- listing order (direct imports) or in the local event's own order (community events);
-- later DigiLab corrections still update linked tournaments. Gaps stay under review.
-- reported_placement keeps DigiLab's shared place for posts (e.g. both shown as 1st).

alter table public.tournament_results add column if not exists reported_placement smallint;
alter table public.tournament_results drop constraint if exists tournament_results_reported_placement_check;
alter table public.tournament_results add constraint tournament_results_reported_placement_check
    check (reported_placement is null or reported_placement between 1 and 999);

-- A placement changed by any other path (manual edits, new imports) clears the shared place.
create or replace function public.clear_stale_reported_placement() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
    if new.placement is distinct from old.placement
       and new.reported_placement is not distinct from old.reported_placement then
        new.reported_placement := null;
    end if;
    return new;
end;
$$;
drop trigger if exists clear_stale_reported_placement on public.tournament_results;
create trigger clear_stale_reported_placement before update on public.tournament_results
    for each row execute function public.clear_stale_reported_placement();

create or replace function public.sync_digilab_tournament_atomic(
    p_external_id bigint, p_tournament jsonb, p_standings jsonb,
    p_player_mappings jsonb default '[]', p_deck_mappings jsonb default '[]',
    p_target_id bigint default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
    v_row jsonb; v_results jsonb := '[]'; v_mappings jsonb := '[]'; v_payload jsonb;
    v_saved jsonb; v_existing public.tournament%rowtype;
    v_target bigint; v_linked bigint; v_store uuid; v_format bigint;
    v_player uuid; v_deck uuid; v_ids uuid[]; v_name text; v_slug text;
    v_format_code text; v_players integer := 0; v_decks integer := 0;
    v_result_id uuid; v_old_deck uuid; v_old_points integer;
    v_count integer; v_updated integer := 0; v_added integer := 0;
begin
    if p_external_id is null or p_external_id <= 0 or
       jsonb_typeof(p_standings) is distinct from 'array' or
       jsonb_typeof(p_player_mappings) is distinct from 'array' or
       jsonb_typeof(p_deck_mappings) is distinct from 'array' then
        raise exception 'Dados DigiLab invalidos.' using errcode = '22023';
    end if;
    if lower(btrim(p_tournament->>'tournament_name')) = '2v2' then
        raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
    end if;
    v_count := jsonb_array_length(p_standings);
    if v_count = 0 or v_count <> (p_tournament->>'player_count')::integer then
        raise exception 'Classificacao incompleta.' using errcode = '22023';
    end if;
    -- Serialize registration across imports, including differently spelled names.
    -- This is a short DB transaction; no external request runs under these locks.
    perform pg_advisory_xact_lock(724092401);
    lock table public.players, public.decks, public.formats in share row exclusive mode;
    select tournament_id into v_linked from public.tournament_digilab_sync
      where digilab_tournament_id = p_external_id and status = 'matched' for update;
    if p_target_id is not null and v_linked is not null and p_target_id <> v_linked then
        raise exception 'DigiLab ja vinculado a outro torneio.' using errcode = '22023';
    end if;
    v_target := coalesce(p_target_id, v_linked);
    select array[store_id] into v_ids from public.community_events where digilab_id=p_external_id and status='finished';
    if not found then
      select array_agg(id) into v_ids from public.stores
        where public.digilab_normalize(name) = public.digilab_normalize(p_tournament#>>'{store,name}');
    end if;
    if coalesce(cardinality(v_ids), 0) <> 1 then
        raise exception 'Loja sem correspondente unico.' using errcode = '22023';
    end if;
    v_store := v_ids[1];
    if v_target is not null then
        select * into v_existing from public.tournament where id = v_target for update;
        if lower(btrim(v_existing.tournament_name)) = '2v2' then
            raise exception 'O torneio 2v2 e exclusivamente local.' using errcode = '22023';
        end if;
        if not found or v_existing.store_id IS DISTINCT FROM v_store or
           v_existing.tournament_date <> (p_tournament->>'date')::date then
            raise exception 'A sincronizacao exige a mesma data e loja.' using errcode = '22023';
        end if;
        if exists(select 1 from public.tournament_digilab_sync where tournament_id = v_target
                  and digilab_tournament_id is not null and digilab_tournament_id <> p_external_id) then
            raise exception 'Torneio local ja vinculado a outro DigiLab.' using errcode = '22023';
        end if;
    elsif exists(select 1 from public.tournament where store_id = v_store
                 and tournament_date = (p_tournament->>'date')::date
                 and lower(btrim(coalesce(tournament_name, ''))) <> '2v2') then
        raise exception 'Possivel torneio local na mesma data; revise o vinculo.' using errcode = '22023';
    end if;

    v_format_code := btrim(coalesce(p_tournament->>'format', ''));
    if regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g') <> '' then
        select id into v_format from public.formats
          where regexp_replace(upper(code), '[^A-Z0-9]', '', 'g') =
                regexp_replace(upper(v_format_code), '[^A-Z0-9]', '', 'g')
          order by (code = v_format_code) desc, id limit 1;
        if v_format is null then
            insert into public.formats(code, name, is_active, is_default)
              values(v_format_code, v_format_code, true, false) returning id into v_format;
        else
            update public.formats set is_active = true where id = v_format;
        end if;
    else
        raise exception 'Formato DigiLab ausente; revise o torneio em vez de usar o formato padrao.' using errcode = '22023';
    end if;
    if v_format is null then raise exception 'Formato nao resolvido.' using errcode = '22023'; end if;

    -- Tied players keep DigiLab's listing order (idx) so renumbering is stable across syncs.
    for v_row in select value from jsonb_array_elements(p_standings) with ordinality as s(value, idx)
                 order by (value->>'placement')::integer, idx loop
        v_player := null; v_deck := null; v_result_id := null; v_old_deck := null; v_old_points := null;
        v_slug := nullif(btrim(v_row#>>'{player,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{player,name}', ''));
        if v_slug is null or public.digilab_normalize(v_name) = '' then
            raise exception 'Jogador anonimo exige revisao.' using errcode = '22023';
        end if;
        select nullif(value->>'player_id', '')::uuid into v_player
          from jsonb_array_elements(p_player_mappings) where value->>'digilab_player_slug' = v_slug limit 1;
        if v_player is null then
            select player_id into v_player from public.digilab_player_sync where digilab_player_slug = v_slug;
        end if;
        if v_player is null then
            select array_agg(id) into v_ids from public.players where
              public.digilab_normalize(name) = public.digilab_normalize(v_name) or
              public.digilab_normalize(digilab_name) = public.digilab_normalize(v_name);
            if cardinality(v_ids) > 1 then raise exception 'Jogador ambiguo: %', v_name using errcode = '22023'; end if;
            v_player := v_ids[1];
            if v_player is null then
                insert into public.players(name, bandai_nick, digilab_name, bandai_id, is_active)
                  values(v_name, v_name, v_name, null, true) returning id into v_player;
                v_players := v_players + 1;
            end if;
        end if;
        if not exists(select 1 from public.players where id = v_player) then
            raise exception 'Mapeamento de jogador invalido.' using errcode = '22023';
        end if;
        if exists(select 1 from jsonb_array_elements(v_results) where value->>'player_id' = v_player::text) then
            raise exception 'Dois jogadores apontam para a mesma pessoa.' using errcode = '22023';
        end if;
        v_mappings := v_mappings || jsonb_build_array(jsonb_build_object(
            'digilab_player_slug', v_slug, 'digilab_player_name', v_name, 'player_id', v_player));

        v_slug := nullif(btrim(v_row#>>'{deck,slug}'), '');
        v_name := btrim(coalesce(v_row#>>'{deck,name}', ''));
        if v_slug is not null or v_name <> '' then
            if v_slug is null then raise exception 'Deck sem slug.' using errcode = '22023'; end if;
            select nullif(value->>'deck_id', '')::uuid into v_deck
              from jsonb_array_elements(p_deck_mappings) where value->>'digilab_deck_slug' = v_slug limit 1;
            if v_deck is null then
                select deck_id into v_deck from public.digilab_deck_sync where digilab_deck_slug = v_slug;
            end if;
            if v_deck is null then
                if public.digilab_normalize(v_name) = '' then
                    raise exception 'Deck sem nome.' using errcode = '22023';
                end if;
                select array_agg(id) into v_ids from public.decks
                  where public.digilab_normalize(name) = public.digilab_normalize(v_name);
                if cardinality(v_ids) > 1 then raise exception 'Deck ambiguo: %', v_name using errcode = '22023'; end if;
                v_deck := v_ids[1];
                if v_deck is null then
                    insert into public.decks(name, is_active) values(v_name, true) returning id into v_deck;
                    v_decks := v_decks + 1;
                end if;
            end if;
            if not exists(select 1 from public.decks where id = v_deck) then
                raise exception 'Mapeamento de deck invalido.' using errcode = '22023';
            end if;
        end if;
        if v_target is not null then
            select id, deck_id, match_points into v_result_id, v_old_deck, v_old_points
              from public.tournament_results where tournament_id = v_target and player_id = v_player for update;
        end if;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'id', v_result_id, 'player_id', v_player, 'deck_id', coalesce(v_deck, v_old_deck),
            'placement', (v_row->>'placement')::integer,
            'digilab_deck_slug', v_slug, 'digilab_deck_name', nullif(v_name, ''),
            'match_points', coalesce((v_row#>>'{record,wins}')::integer * 3 + (v_row#>>'{record,ties}')::integer, v_old_points)));
    end loop;
    -- DigiLab reports ties as shared places (1, 1, 3). Accept that ranking at any position,
    -- but reject gaps or out-of-order places, then number tied players in listing order.
    if exists(select 1 from (
            select (value->>'placement')::integer as placement, pos,
                   min(pos) over (partition by (value->>'placement')::integer) as first_pos
            from jsonb_array_elements(v_results) with ordinality as r(value, pos)) ranked
              where placement is distinct from first_pos) then
        raise exception 'Colocacoes incompletas exigem revisao.' using errcode = '22023';
    end if;
    select jsonb_agg(value || jsonb_build_object('placement', pos,
               'reported_placement', (value->>'placement')::integer) order by pos) into v_results
      from jsonb_array_elements(v_results) with ordinality as r(value, pos);
    if v_target is not null and exists(
        select 1 from public.tournament_results r where r.tournament_id = v_target and not exists(
            select 1 from jsonb_array_elements(v_results) where value->>'player_id' = r.player_id::text)) then
        raise exception 'Jogadores locais ausentes no DigiLab; revise antes de remover resultados.' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('store_id', v_store, 'organizer_name',(select organizer from public.community_events where digilab_id=p_external_id and status='finished'), 'tournament_date', p_tournament->>'date',
        'tournament_name', coalesce(v_existing.tournament_name, nullif(p_tournament->>'tournament_name', ''), 'Semanal'),
        'total_players', v_count, 'format_id', v_format, 'instagram_link', v_existing.instagram_link,
        'rounds', p_tournament->'rounds');
    if v_target is not null then
        select count(*) into v_added from jsonb_array_elements(v_results) r where nullif(r->>'id', '') is null;
        select count(*) into v_updated from jsonb_array_elements(v_results) r
          join public.tournament_results t on t.id = nullif(r->>'id', '')::uuid
          where t.deck_id is distinct from nullif(r->>'deck_id', '')::uuid
             or t.match_points is distinct from nullif(r->>'match_points', '')::integer
             or t.placement is distinct from (r->>'placement')::integer;
        perform public.save_tournament_transaction(v_target, v_payload, v_results, '[]');
        update public.tournament set rounds = coalesce(nullif(p_tournament->>'rounds', '')::smallint, rounds) where id = v_target;
        insert into public.tournament_digilab_sync(tournament_id, digilab_tournament_id, digilab_url, status, verified_at)
          values(v_target, p_external_id, 'https://digilab.cards/tournament/' || p_external_id, 'matched', now())
          on conflict(tournament_id) do update set
            digilab_tournament_id = excluded.digilab_tournament_id, digilab_url = excluded.digilab_url,
            status = 'matched', verified_at = excluded.verified_at, last_error_code = null;
    end if;
    -- Existing RPC persists the mappings and link in this same transaction.
    v_saved := public.import_digilab_tournament_transaction(p_external_id,
        'https://digilab.cards/tournament/' || p_external_id, v_payload, v_results, v_mappings);
    -- Keep DigiLab's shared place only where it differs from the unique numbering.
    update public.tournament_results t
       set reported_placement = case when (r->>'reported_placement')::smallint <> t.placement
                                     then (r->>'reported_placement')::smallint end
      from jsonb_array_elements(v_results) r
     where t.tournament_id = (v_saved->>'tournament_id')::bigint
       and t.player_id = (r->>'player_id')::uuid;
    return v_saved || jsonb_build_object('players_created', v_players, 'decks_created', v_decks,
        'results_updated', v_updated, 'results_added', v_added, 'reused', v_target is not null,
        'tournament_updated', v_target is not null and (
            v_existing.format_id is distinct from v_format or v_existing.total_players is distinct from v_count or
            v_existing.rounds is distinct from coalesce(nullif(p_tournament->>'rounds', '')::smallint, v_existing.rounds)));
end;
$$;

create or replace function public.community_reconcile(p_external bigint,p_tournament jsonb,p_standings jsonb,p_dnfs jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; s jsonb; local_entry public.community_entries; local_player public.players;
 mappings jsonb:='[]'; ordered jsonb:='[]'; result jsonb; local_scores jsonb; pos integer:=0; ext_points integer; issue text;
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
  -- DigiLab may report ties as shared places (1, 1, 3) at any position. Validate that
  -- ranking, let each tied player match any local position inside the tie, and send the
  -- standings in the local final order so the event's own tiebreak decides the places.
  if exists(select 1 from (
     select (value->>'placement')::integer as placement, rank_pos,
            min(rank_pos) over (partition by (value->>'placement')::integer) as first_pos
     from (select value, row_number() over (order by (value->>'placement')::integer, idx) as rank_pos
           from jsonb_array_elements(p_standings) with ordinality as x(value, idx)) sorted) ranked
     where placement is distinct from first_pos) then
   raise exception 'Colocações externas incompletas.';
  end if;
  for pos in 1..jsonb_array_length(p_standings) loop
   select * into local_entry from public.community_entries where id=(e.final_order->>(pos-1))::uuid and event_id=e.id;
   if not found then raise exception 'Participante local não encontrado.'; end if;
   select * into local_player from public.players where id=local_entry.player_id;
   select x.value into s from jsonb_array_elements(p_standings) with ordinality as x(value, idx)
    where (x.value->>'placement')::integer=(select max((v.value->>'placement')::integer)
                                           from jsonb_array_elements(p_standings) as v(value)
                                           where (v.value->>'placement')::integer<=pos)
     and nullif(x.value#>>'{player,slug}','') is not null
     and not exists(select 1 from jsonb_array_elements(ordered) as o(value)
                    where o.value#>>'{player,slug}'=x.value#>>'{player,slug}')
     and (public.digilab_normalize(x.value#>>'{player,name}')=public.digilab_normalize(local_player.name) or
          public.digilab_normalize(x.value#>>'{player,name}')=public.digilab_normalize(local_player.digilab_name) or
          exists(select 1 from public.digilab_player_sync where digilab_player_slug=x.value#>>'{player,slug}' and player_id=local_player.id))
    order by x.idx limit 1;
   if s is null then raise exception 'Jogador ou colocação divergente na posição %.',pos; end if;
   if exists(select 1 from public.digilab_player_sync where digilab_player_slug=s#>>'{player,slug}' and player_id<>local_player.id) then raise exception 'Identidade DigiLab vinculada a outro jogador.'; end if;
   ext_points:=case when s#>>'{record,wins}' is not null and s#>>'{record,ties}' is not null
    then 3*(s#>>'{record,wins}')::integer+(s#>>'{record,ties}')::integer else nullif(s->>'match_points','')::integer end;
   if ext_points is not null and ext_points is distinct from (select (v->>'points')::integer from jsonb_array_elements(local_scores) v where v->>'id'=local_entry.id::text) then raise exception 'Pontos divergentes na posição %.',pos; end if;
   ordered:=ordered||jsonb_build_array(s);
   mappings:=mappings||jsonb_build_array(jsonb_build_object('digilab_player_slug',s#>>'{player,slug}','player_id',local_player.id));
   s:=null;
  end loop;
  result:=public.sync_digilab_tournament_atomic(p_external,p_tournament||jsonb_build_object('tournament_name',e.event_type),ordered,mappings,'[]',e.canonical_tournament_id);
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


create or replace view public.v_podium_full with (security_invoker = true) as
select tr.id,
    tr.store_id,
    coalesce(s.name, t.organizer_name, 'Comunidade'::text) as store,
    tr.tournament_date,
    tr.placement,
    p.name as player,
    d.name as deck,
    di.image_url,
    tr.total_players,
    tr.tournament_id,
    tr.decklist,
    t.tournament_name,
    t.instagram_link,
    coalesce(f.code, 'UNSPECIFIED'::text) as format_code,
    tr.match_points,
    tr.team_member,
    tr.reported_placement
from public.tournament_results tr
    left join public.stores s on s.id = tr.store_id
    left join public.decks d on d.id = tr.deck_id
    left join public.players p on p.id = tr.player_id
    left join public.tournament t on t.id = tr.tournament_id
    left join public.formats f on f.id = t.format_id
    left join lateral (
        select dimg.image_url
        from public.deck_images dimg
        where dimg.deck_id = d.id
        order by dimg.created_at desc, dimg.id desc
        limit 1
    ) di on true;

notify pgrst, 'reload schema';

commit;
