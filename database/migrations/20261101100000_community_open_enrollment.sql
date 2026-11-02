begin;

-- New events are immediately discoverable and accept enrollment, without a publication step.
create or replace function public.community_create(p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; chosen_start timestamptz; chosen_format bigint; initial_players jsonb:=coalesce(p_data->'player_ids','[]'::jsonb);
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 chosen_start:=coalesce(nullif(p_data->>'starts_at','')::timestamptz,
  nullif(p_data->>'date','')::date::timestamp at time zone 'America/Sao_Paulo',
  date_trunc('minute',now()));
 if not isfinite(chosen_start) then raise exception 'Informe uma data e horário válidos.'; end if;
 chosen_format:=nullif(p_data->>'format_id','')::bigint;
 if chosen_format is null then
  select id into chosen_format from public.formats where coalesce(is_active,true) and code<>'UNSPECIFIED'
   order by is_default desc nulls last,created_at desc nulls last,id desc limit 1;
 end if;
 if chosen_format is null then raise exception 'Cadastre um formato ativo antes de criar o torneio.'; end if;
 if jsonb_typeof(initial_players) is distinct from 'array' then raise exception 'Seleção de jogadores inválida.'; end if;
 insert into public.community_events(name,store_id,location,modality,starts_at,event_type,format_id,capacity,created_by,status,registration_open)
 values(btrim(p_data->>'name'),nullif(p_data->>'store_id','')::uuid,left(coalesce(p_data->>'location','Curitiba, Brazil'),500),
  coalesce(nullif(p_data->>'modality',''),'presencial'),chosen_start,
  coalesce(nullif(btrim(p_data->>'event_type'),''),'For Fun'),chosen_format,32,auth.uid(),'published',true) returning id into target;
 insert into public.community_audit(event_id,actor,action,details) values(target,auth.uid(),'create',p_data||jsonb_build_object('capacity',32,'starts_at',chosen_start));
 if jsonb_array_length(initial_players)>0 then perform public.community_add_players(target,initial_players,0); end if;
 return target;
end $$;

revoke all on function public.community_create(jsonb) from public,anon,authenticated;
grant execute on function public.community_create(jsonb) to authenticated;
-- Existing drafts follow the same open-enrollment flow.
with opened as (
 update public.community_events set status='published',registration_open=true,revision=revision+1
 where status='draft' or (status='published' and not registration_open) returning id
)
insert into public.community_audit(event_id,actor,action,details)
select id,null,'open_registration_on_create','{}'::jsonb from opened;
notify pgrst,'reload schema';
commit;
