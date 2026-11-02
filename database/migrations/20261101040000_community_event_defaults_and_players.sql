begin;

-- Additive registration locks capacity and validates the entire selection first.
create or replace function public.community_add_players(p_event uuid,p_players jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; selected_ids uuid[]; added integer; existing integer;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status not in ('draft','published') then raise exception 'A inclusão de jogadores encerra ao iniciar o torneio.'; end if;
 if p_revision is null or p_revision>e.revision then raise exception 'Atualize o torneio e tente novamente.' using errcode='40001'; end if;
 if jsonb_typeof(p_players) is distinct from 'array' or jsonb_array_length(p_players)>128 then raise exception 'Seleção de jogadores inválida.'; end if;
 select array_agg(distinct value::uuid) into selected_ids from jsonb_array_elements_text(p_players);
 if coalesce(cardinality(selected_ids),0)=0 or array_position(selected_ids,null) is not null then raise exception 'Selecione pelo menos um jogador.'; end if;
 if exists(select 1 from unnest(selected_ids) as selected(player_id) where not exists(select 1 from public.players p where p.id=selected.player_id)) then raise exception 'Um dos jogadores selecionados não está cadastrado.'; end if;
 select count(*) into existing from public.community_entries where event_id=e.id;
 select count(*) into added from unnest(selected_ids) as selected(player_id) where not exists(select 1 from public.community_entries n where n.event_id=e.id and n.player_id=selected.player_id);
 if existing+added>e.capacity then raise exception 'A seleção ultrapassa as vagas disponíveis. Nenhum jogador foi incluído.'; end if;
 insert into public.community_entries(event_id,player_id) select e.id,selected.player_id from unnest(selected_ids) as selected(player_id) on conflict(event_id,player_id) do nothing;
 update public.community_events set revision=revision+1 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'add_players',jsonb_build_object('player_ids',selected_ids,'added',added));
 return public.community_snapshot(e.id);
end $$;

create or replace function public.community_create(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; chosen_date date; chosen_format bigint; initial_players jsonb:=coalesce(p_data->'player_ids','[]'::jsonb);
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 chosen_date:=coalesce(nullif(p_data->>'date','')::date,
  (nullif(p_data->>'starts_at','')::timestamptz at time zone 'America/Sao_Paulo')::date,
  (now() at time zone 'America/Sao_Paulo')::date);
 chosen_format:=nullif(p_data->>'format_id','')::bigint;
 if chosen_format is null then
  select id into chosen_format from public.formats where coalesce(is_active,true) and code<>'UNSPECIFIED'
   order by is_default desc nulls last,created_at desc nulls last,id desc limit 1;
 end if;
 if chosen_format is null then raise exception 'Cadastre um formato ativo antes de criar o torneio.'; end if;
 if jsonb_typeof(initial_players) is distinct from 'array' then raise exception 'Seleção de jogadores inválida.'; end if;
 insert into public.community_events(name,store_id,location,modality,starts_at,event_type,format_id,capacity,created_by)
 values(btrim(p_data->>'name'),nullif(p_data->>'store_id','')::uuid,left(coalesce(p_data->>'location','Curitiba, Brazil'),500),
  coalesce(nullif(p_data->>'modality',''),'presencial'),chosen_date::timestamp at time zone 'America/Sao_Paulo',
  coalesce(nullif(btrim(p_data->>'event_type'),''),'For Fun'),chosen_format,32,auth.uid()) returning id into target;
 insert into public.community_audit(event_id,actor,action,details) values(target,auth.uid(),'create',p_data||jsonb_build_object('capacity',32,'date',chosen_date));
 if jsonb_array_length(initial_players)>0 then perform public.community_add_players(target,initial_players,0); end if;
 return target;
end $$;

revoke all on function public.community_add_players(uuid,jsonb,integer),public.community_create(jsonb) from public,anon,authenticated;
grant execute on function public.community_add_players(uuid,jsonb,integer),public.community_create(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
