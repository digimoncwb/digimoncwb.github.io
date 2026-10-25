begin;

create function public.record_site_integration_event(p_actor_user_id uuid,p_operation text,p_execution_id uuid,p_status integer,
    p_parent_operation_id uuid,p_actor_kind text) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
    if auth.role() is distinct from 'service_role' then raise exception 'Operação de servidor.' using errcode='42501'; end if;
    if p_operation !~ '^[a-z0-9-]{1,80}$' or p_status not between 100 and 599
        or p_actor_kind not in ('user','service','anonymous')
        or (p_actor_kind='user' and p_actor_user_id is null)
        or (p_actor_kind<>'user' and p_actor_user_id is not null) then raise exception 'Evento inválido.'; end if;
    insert into site_audit.integration_runs(operation_id,parent_operation_id,operation,actor_user_id,finished_at,http_status)
    values(p_execution_id,p_parent_operation_id,p_operation,p_actor_user_id,clock_timestamp(),p_status)
    on conflict(operation_id) do update set finished_at=excluded.finished_at,http_status=excluded.http_status;
    insert into site_audit.events(actor_user_id,actor_kind,action,entity_type,entity_id,operation_id,outcome,changes)
    values(p_actor_user_id,p_actor_kind,'integration.'||p_operation,'integration',p_execution_id::text,p_execution_id::text,
        case when p_status in (401,403) then 'denied' when p_status>=400 then 'failure' else 'success' end,
        jsonb_build_object('http_status',p_status,'parent_operation_id',p_parent_operation_id));
end;
$$;
-- Older deployed callers retain their former classification until updated.
create or replace function public.record_site_integration_event(p_actor_user_id uuid,p_operation text,p_execution_id uuid,p_status integer,p_parent_operation_id uuid) returns void
language sql security definer set search_path=pg_catalog,public as $$
    select public.record_site_integration_event(p_actor_user_id,p_operation,p_execution_id,p_status,p_parent_operation_id,
        case when p_actor_user_id is not null then 'user' when p_status in (401,403) then 'anonymous' else 'service' end)
$$;
revoke all on function public.record_site_integration_event(uuid,text,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.record_site_integration_event(uuid,text,uuid,integer,uuid,text) to service_role;

commit;
