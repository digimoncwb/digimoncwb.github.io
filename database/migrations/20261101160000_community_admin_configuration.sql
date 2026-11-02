begin;

create or replace function public.community_configure_event(p_event uuid,p_data jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events; planned timestamptz; seats integer;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found or e.status='cancelled' then raise exception 'Torneio indisponível para edição.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e tente novamente.' using errcode='40001'; end if;
 planned:=(p_data->>'starts_at')::timestamptz;
 if planned is null or not isfinite(planned) then raise exception 'Informe uma data e horário válidos.'; end if;
 seats:=coalesce((p_data->>'capacity')::integer,e.capacity);
 if seats not between 4 and 128 or seats<(select count(*) from public.community_entries where event_id=e.id) then raise exception 'A capacidade não pode ser menor que as inscrições existentes.'; end if;
 update public.community_events set name=btrim(p_data->>'name'),store_id=nullif(p_data->>'store_id','')::uuid,
  location=left(coalesce(p_data->>'location',''),500),modality=p_data->>'modality',starts_at=planned,
  event_type=p_data->>'event_type',format_id=(p_data->>'format_id')::bigint,capacity=seats,revision=revision+1,
  reconciliation=case when e.status='finished' and (e.digilab_id is not null or e.canonical_tournament_id is not null) then 'review' else reconciliation end,
  reconcile_error=case when e.status='finished' and (e.digilab_id is not null or e.canonical_tournament_id is not null) then 'Configurações locais alteradas. Confira a submissão no DigiLab.' else reconcile_error end
 where id=e.id;
 insert into public.community_audit(event_id,actor,action,details) values(e.id,auth.uid(),'configure',p_data-'decklist');
 return public.community_snapshot(e.id);
end $$;
revoke all on function public.community_configure_event(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.community_configure_event(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
