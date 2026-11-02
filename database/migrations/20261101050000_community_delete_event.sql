begin;

-- Hard deletion is an explicit admin command, serialized with event operations.
create or replace function public.community_delete_event(p_event uuid,p_revision integer,p_name text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.community_events;
begin
 if not public.community_admin() then raise exception 'Acesso administrativo necessário.' using errcode='42501'; end if;
 select * into e from public.community_events where id=p_event for update;
 if not found then raise exception 'Torneio não encontrado.'; end if;
 if p_revision is null or p_revision<>e.revision then raise exception 'O torneio mudou. Atualize e confirme a exclusão novamente.' using errcode='40001'; end if;
 if p_name is null or btrim(p_name)<>e.name then raise exception 'Digite o nome do torneio para confirmar a exclusão.'; end if;
 -- Delete dependents explicitly, including audit/export tables without cascading FKs.
 delete from public.community_exports where event_id=e.id;
 delete from public.community_audit where event_id=e.id;
 delete from public.community_matches where event_id=e.id;
 delete from public.community_rounds where event_id=e.id;
 delete from public.community_entries where event_id=e.id;
 delete from public.community_events where id=e.id;
 -- A separately imported official DigiLab result is not owned by this event.
 return e.id;
end $$;

revoke all on function public.community_delete_event(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.community_delete_event(uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
